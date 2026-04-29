package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/models"
	"github.com/bugcatcher/api/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
)

const (
	uploadSessionTTL     = 15 * time.Minute
	maxDomSnapshotCount  = 60
	defaultScreenshotCT  = "image/png"
	defaultVideoCT       = "video/webm"
	defaultDomSnapshotCT = "application/json"
)

type UploadSessionHandler struct {
	db          *database.Database
	minioClient *storage.MinIOClient
	cfg         *config.Config
}

type UploadArtifactRequest struct {
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"sizeBytes"`
}

type UploadDomSnapshotRequest struct {
	Count       int    `json:"count"`
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"sizeBytes"`
}

type UploadSessionRequest struct {
	ProjectID string `json:"projectId"`
	Artifacts struct {
		Screenshot   *UploadArtifactRequest   `json:"screenshot,omitempty"`
		Video        *UploadArtifactRequest   `json:"video,omitempty"`
		DOMSnapshots *UploadDomSnapshotRequest `json:"domSnapshots,omitempty"`
	} `json:"artifacts"`
}

type UploadArtifactResponse struct {
	Key         string `json:"key"`
	UploadURL   string `json:"uploadUrl"`
	Method      string `json:"method"`
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"sizeBytes,omitempty"`
}

type UploadSessionResponse struct {
	UploadID  string `json:"uploadId"`
	SessionID string `json:"sessionId"`
	ExpiresAt string `json:"expiresAt"`
	Artifacts struct {
		Screenshot   *UploadArtifactResponse   `json:"screenshot,omitempty"`
		Video        *UploadArtifactResponse   `json:"video,omitempty"`
		DOMSnapshots []UploadArtifactResponse  `json:"domSnapshots,omitempty"`
	} `json:"artifacts"`
}

type FinalizeSessionRequest struct {
	ProjectID   string            `json:"projectId"`
	URL         string            `json:"url"`
	Title       string            `json:"title"`
	Timestamp   time.Time         `json:"timestamp"`
	Duration    int64             `json:"duration"`
	Environment models.Environment `json:"environment"`
	App         models.App        `json:"app"`
	Error       *models.ErrorInfo `json:"error"`
	Events      []models.Event    `json:"events"`
	Media       struct {
		HasReplay bool `json:"hasReplay"`
	} `json:"media"`
}

type FinalizeSessionResponse struct {
	SessionID string   `json:"sessionId"`
	Warnings  []string `json:"warnings,omitempty"`
	Storage   storagePolicyStatus `json:"storage"`
}

func NewUploadSessionHandler(db *database.Database, minioClient *storage.MinIOClient, cfg *config.Config) *UploadSessionHandler {
	return &UploadSessionHandler{db: db, minioClient: minioClient, cfg: cfg}
}

func (h *UploadSessionHandler) CreateUploadSession(c *gin.Context) {
	if h.minioClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "Object storage is not configured",
			"code":  "STORAGE_UNAVAILABLE",
		})
		return
	}

	projectID := getProjectIDFromContext(c)
	if projectID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Project context missing",
			"code":  "AUTH_CONTEXT_MISSING",
		})
		return
	}

	var payload UploadSessionRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
		})
		return
	}

	if payload.ProjectID != "" && strings.TrimSpace(payload.ProjectID) != projectID {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "projectId mismatch",
			"code":  "PROJECT_MISMATCH",
		})
		return
	}

	sessionID := uuid.New().String()
	uploadID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(uploadSessionTTL)

	response := UploadSessionResponse{
		UploadID:  uploadID,
		SessionID: sessionID,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	}

	record := models.UploadSession{
		UploadID:  uploadID,
		ProjectID: projectID,
		SessionID: sessionID,
		Status:    "pending",
		CreatedAt: time.Now().UTC(),
		ExpiresAt: expiresAt,
	}

	if payload.Artifacts.Screenshot != nil {
		contentType := normalizeContentType(payload.Artifacts.Screenshot.ContentType, defaultScreenshotCT)
		key := buildArtifactKey(projectID, sessionID, "screenshot", contentType, 0)
		uploadURL, err := h.minioClient.GetPresignedPutURL(c.Request.Context(), key, uploadSessionTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create upload URL",
				"code":  "PRESIGN_FAILED",
			})
			return
		}

		response.Artifacts.Screenshot = &UploadArtifactResponse{
			Key:         key,
			UploadURL:   uploadURL,
			Method:      http.MethodPut,
			ContentType: contentType,
			SizeBytes:   payload.Artifacts.Screenshot.SizeBytes,
		}
		record.Screenshot = &models.UploadArtifact{
			Key:         key,
			ContentType: contentType,
			SizeBytes:   payload.Artifacts.Screenshot.SizeBytes,
		}
	}

	if payload.Artifacts.Video != nil {
		contentType := normalizeContentType(payload.Artifacts.Video.ContentType, defaultVideoCT)
		key := buildArtifactKey(projectID, sessionID, "video", contentType, 0)
		uploadURL, err := h.minioClient.GetPresignedPutURL(c.Request.Context(), key, uploadSessionTTL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create upload URL",
				"code":  "PRESIGN_FAILED",
			})
			return
		}

		response.Artifacts.Video = &UploadArtifactResponse{
			Key:         key,
			UploadURL:   uploadURL,
			Method:      http.MethodPut,
			ContentType: contentType,
			SizeBytes:   payload.Artifacts.Video.SizeBytes,
		}
		record.Video = &models.UploadArtifact{
			Key:         key,
			ContentType: contentType,
			SizeBytes:   payload.Artifacts.Video.SizeBytes,
		}
	}

	if payload.Artifacts.DOMSnapshots != nil && payload.Artifacts.DOMSnapshots.Count > 0 {
		if payload.Artifacts.DOMSnapshots.Count > maxDomSnapshotCount {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("domSnapshots.count must be <= %d", maxDomSnapshotCount),
				"code":  "INVALID_DOM_COUNT",
			})
			return
		}

		contentType := normalizeContentType(payload.Artifacts.DOMSnapshots.ContentType, defaultDomSnapshotCT)
		response.Artifacts.DOMSnapshots = make([]UploadArtifactResponse, 0, payload.Artifacts.DOMSnapshots.Count)
		record.DOMSnapshots = make([]models.UploadArtifact, 0, payload.Artifacts.DOMSnapshots.Count)

		for i := 0; i < payload.Artifacts.DOMSnapshots.Count; i++ {
			key := buildArtifactKey(projectID, sessionID, "dom", contentType, i)
			uploadURL, err := h.minioClient.GetPresignedPutURL(c.Request.Context(), key, uploadSessionTTL)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Failed to create upload URL",
					"code":  "PRESIGN_FAILED",
				})
				return
			}

			response.Artifacts.DOMSnapshots = append(response.Artifacts.DOMSnapshots, UploadArtifactResponse{
				Key:         key,
				UploadURL:   uploadURL,
				Method:      http.MethodPut,
				ContentType: contentType,
				SizeBytes:   payload.Artifacts.DOMSnapshots.SizeBytes,
			})
			record.DOMSnapshots = append(record.DOMSnapshots, models.UploadArtifact{
				Key:         key,
				ContentType: contentType,
				SizeBytes:   payload.Artifacts.DOMSnapshots.SizeBytes,
			})
		}
	}

	record.HasReplay = record.Video != nil || len(record.DOMSnapshots) > 0

	if _, err := h.db.UploadSessions.InsertOne(c.Request.Context(), record); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create upload session",
			"code":  "DB_INSERT_ERROR",
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *UploadSessionHandler) FinalizeUploadSession(c *gin.Context) {
	uploadID := strings.TrimSpace(c.Param("id"))
	if uploadID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "uploadId is required",
			"code":  "INVALID_UPLOAD_ID",
		})
		return
	}

	projectID := getProjectIDFromContext(c)
	if projectID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Project context missing",
			"code":  "AUTH_CONTEXT_MISSING",
		})
		return
	}

	var uploadSession models.UploadSession
	err := h.db.UploadSessions.FindOne(c.Request.Context(), bson.M{
		"uploadId": uploadID,
		"projectId": projectID,
	}).Decode(&uploadSession)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Upload session not found",
			"code":  "UPLOAD_NOT_FOUND",
		})
		return
	}

	if uploadSession.Status == "finalized" {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Upload session already finalized",
			"code":  "UPLOAD_ALREADY_FINALIZED",
		})
		return
	}

	if time.Now().UTC().After(uploadSession.ExpiresAt) {
		_, _ = h.db.UploadSessions.UpdateOne(c.Request.Context(), bson.M{"uploadId": uploadID}, bson.M{
			"$set": bson.M{"status": "expired"},
		})
		c.JSON(http.StatusGone, gin.H{
			"error": "Upload session expired",
			"code":  "UPLOAD_EXPIRED",
		})
		return
	}

	var payload FinalizeSessionRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
		})
		return
	}

	payload.ProjectID = projectID

	sessionPayload := models.SessionPayload{
		ProjectID:   payload.ProjectID,
		URL:         payload.URL,
		Title:       payload.Title,
		Timestamp:   payload.Timestamp,
		Duration:    payload.Duration,
		Environment: payload.Environment,
		App:         payload.App,
		Error:       payload.Error,
		Events:      payload.Events,
		Media: models.Media{
			ScreenshotKey: artifactKey(uploadSession.Screenshot),
			VideoKey:      artifactKey(uploadSession.Video),
			DOMSnapshots:  extractDOMKeys(uploadSession.DOMSnapshots),
			HasReplay:     payload.Media.HasReplay || uploadSession.HasReplay,
		},
	}

	if issues := validateSessionPayload(sessionPayload); len(issues) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request payload",
			"code":    "INVALID_PAYLOAD",
			"details": issues,
		})
		return
	}

	warnings := make([]string, 0)
	if h.minioClient != nil {
		if key := artifactKey(uploadSession.Screenshot); key != "" {
			if err := h.minioClient.StatObject(c.Request.Context(), key); err != nil {
				warnings = append(warnings, "Screenshot upload missing or unavailable")
				sessionPayload.Media.ScreenshotKey = ""
			}
		}
		if key := artifactKey(uploadSession.Video); key != "" {
			if err := h.minioClient.StatObject(c.Request.Context(), key); err != nil {
				warnings = append(warnings, "Video upload missing or unavailable")
				sessionPayload.Media.VideoKey = ""
			}
		}
		if len(sessionPayload.Media.DOMSnapshots) > 0 {
			valid := make([]string, 0, len(sessionPayload.Media.DOMSnapshots))
			for _, key := range sessionPayload.Media.DOMSnapshots {
				if err := h.minioClient.StatObject(c.Request.Context(), key); err != nil {
					warnings = append(warnings, fmt.Sprintf("DOM snapshot missing: %s", key))
					continue
				}
				valid = append(valid, key)
			}
			sessionPayload.Media.DOMSnapshots = valid
		}
	}

	sessionHandler := NewSessionHandler(h.db, h.minioClient, h.cfg)
	result, createErr := sessionHandler.createSessionWithID(c.Request.Context(), sessionPayload, uploadSession.SessionID)
	if createErr != nil {
		response := gin.H{
			"error": createErr.message,
			"code":  createErr.code,
		}
		if len(createErr.details) > 0 {
			response["details"] = createErr.details
		}
		c.JSON(createErr.status, response)
		return
	}

	now := time.Now().UTC()
	_, _ = h.db.UploadSessions.UpdateOne(c.Request.Context(), bson.M{"uploadId": uploadID}, bson.M{
		"$set": bson.M{
			"status":      "finalized",
			"finalizedAt": now,
		},
	})

	c.JSON(http.StatusOK, FinalizeSessionResponse{
		SessionID: result.sessionID,
		Warnings:  warnings,
		Storage:   result.storageStatus,
	})
}

func getProjectIDFromContext(c *gin.Context) string {
	value, ok := c.Get("projectId")
	if !ok {
		return ""
	}
	projectID, _ := value.(string)
	return strings.TrimSpace(projectID)
}

func normalizeContentType(value string, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

func artifactKey(artifact *models.UploadArtifact) string {
	if artifact == nil {
		return ""
	}
	return strings.TrimSpace(artifact.Key)
}

func extractDOMKeys(items []models.UploadArtifact) []string {
	keys := make([]string, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.Key) != "" {
			keys = append(keys, item.Key)
		}
	}
	return keys
}

func buildArtifactKey(projectID string, sessionID string, kind string, contentType string, index int) string {
	ext := extensionForContentType(kind, contentType)
	if kind == "dom" {
		return fmt.Sprintf("projects/%s/sessions/%s/dom/%03d%s", projectID, sessionID, index+1, ext)
	}
	return fmt.Sprintf("projects/%s/sessions/%s/%s%s", projectID, sessionID, kind, ext)
}

func extensionForContentType(kind string, contentType string) string {
	lower := strings.ToLower(contentType)
	if strings.Contains(lower, "png") {
		return ".png"
	}
	if strings.Contains(lower, "jpeg") || strings.Contains(lower, "jpg") {
		return ".jpg"
	}
	if strings.Contains(lower, "webm") {
		return ".webm"
	}
	if strings.Contains(lower, "json") {
		return ".json"
	}
	if strings.Contains(lower, "html") {
		return ".html"
	}
	if kind == "dom" {
		return ".json"
	}
	if kind == "video" {
		return ".webm"
	}
	if kind == "screenshot" {
		return ".png"
	}
	return ".bin"
}
