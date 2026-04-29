package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/models"
	"github.com/bugcatcher/api/internal/storage"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// PluginGatewayHandler exposes a versioned contract for IDE/automation plugins.
type PluginGatewayHandler struct {
	db                *database.Database
	minioClient       *storage.MinIOClient
	cfg               *config.Config
	supportedVersions []string
}

func NewPluginGatewayHandler(db *database.Database, minioClient *storage.MinIOClient, cfg *config.Config) *PluginGatewayHandler {
	return &PluginGatewayHandler{
		db:                db,
		minioClient:       minioClient,
		cfg:               cfg,
		supportedVersions: []string{"1.0"},
	}
}

func (h *PluginGatewayHandler) Manifest(c *gin.Context) {
	version, err := h.negotiateVersion(c.GetHeader("X-Plugin-Version"))
	if err != nil {
		c.JSON(http.StatusConflict, models.PluginGatewayError{
			Code:    "UNSUPPORTED_VERSION",
			Message: err.Error(),
			Detail:  "Supported versions: " + strings.Join(h.supportedVersions, ","),
		})
		return
	}

	manifest := h.buildManifest(version)
	c.JSON(http.StatusOK, manifest)
}

func (h *PluginGatewayHandler) ListSessions(c *gin.Context) {
	if _, err := h.negotiateVersion(c.GetHeader("X-Plugin-Version")); err != nil {
		c.JSON(http.StatusConflict, models.PluginGatewayError{
			Code:    "UNSUPPORTED_VERSION",
			Message: err.Error(),
			Detail:  "Supported versions: " + strings.Join(h.supportedVersions, ","),
		})
		return
	}

	filter := bson.M{}
	if projectID := strings.TrimSpace(c.Query("projectId")); projectID != "" {
		filter["projectId"] = projectID
	}
	if tag := strings.TrimSpace(c.Query("tag")); tag != "" {
		filter["tags"] = tag
	}

	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)
	offset, _ := strconv.ParseInt(c.DefaultQuery("offset", "0"), 10, 64)
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	sortDirection := int32(-1)
	sortField := "createdAt"
	if strings.ToLower(c.DefaultQuery("sortOrder", "desc")) == "asc" {
		sortDirection = 1
	}

	total, err := h.db.Sessions.CountDocuments(context.Background(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.PluginGatewayError{Code: "DB_COUNT_ERROR", Message: "Failed to count sessions"})
		return
	}

	opts := options.Find().SetLimit(limit).SetSkip(offset).SetSort(bson.D{{Key: sortField, Value: sortDirection}})
	cursor, err := h.db.Sessions.Find(context.Background(), filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.PluginGatewayError{Code: "DB_FIND_ERROR", Message: "Failed to fetch sessions"})
		return
	}
	defer cursor.Close(context.Background())

	items := make([]gin.H, 0)
	for cursor.Next(context.Background()) {
		var session models.Session
		if err := cursor.Decode(&session); err != nil {
			continue
		}

		item := gin.H{
			"sessionId": session.SessionID,
			"title":     session.Title,
			"url":       session.URL,
			"timestamp": session.Timestamp,
			"error":     session.Error,
			"stats":     session.Stats,
			"tags":      session.Tags,
			"triage":    session.TriageSummary,
		}

		signedMedia := h.signMedia(session.Media)
		if len(signedMedia) > 0 {
			item["artifacts"] = signedMedia
		}

		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (h *PluginGatewayHandler) GetSession(c *gin.Context) {
	if _, err := h.negotiateVersion(c.GetHeader("X-Plugin-Version")); err != nil {
		c.JSON(http.StatusConflict, models.PluginGatewayError{
			Code:    "UNSUPPORTED_VERSION",
			Message: err.Error(),
			Detail:  "Supported versions: " + strings.Join(h.supportedVersions, ","),
		})
		return
	}

	sessionID := c.Param("id")
	var session models.Session
	if err := h.db.Sessions.FindOne(context.Background(), bson.M{"sessionId": sessionID}).Decode(&session); err != nil {
		c.JSON(http.StatusNotFound, models.PluginGatewayError{Code: "SESSION_NOT_FOUND", Message: "Session not found"})
		return
	}

	signedMedia := h.signMedia(session.Media)

	c.JSON(http.StatusOK, gin.H{
		"session":   session,
		"artifacts": signedMedia,
	})
}

// TriggerExport currently returns a structured not-implemented payload while keeping the contract stable.
func (h *PluginGatewayHandler) TriggerExport(c *gin.Context) {
	type exportRequest struct {
		SessionID   string                 `json:"sessionId"`
		Destination string                 `json:"destination"`
		Options     map[string]interface{} `json:"options"`
	}

	if _, err := h.negotiateVersion(c.GetHeader("X-Plugin-Version")); err != nil {
		c.JSON(http.StatusConflict, models.PluginGatewayError{
			Code:    "UNSUPPORTED_VERSION",
			Message: err.Error(),
			Detail:  "Supported versions: " + strings.Join(h.supportedVersions, ","),
		})
		return
	}

	var payload exportRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, models.PluginGatewayError{Code: "INVALID_PAYLOAD", Message: "Invalid export request", Detail: err.Error()})
		return
	}

	if strings.TrimSpace(payload.SessionID) == "" || strings.TrimSpace(payload.Destination) == "" {
		c.JSON(http.StatusBadRequest, models.PluginGatewayError{Code: "INVALID_PAYLOAD", Message: "sessionId and destination are required"})
		return
	}

	if err := h.db.Sessions.FindOne(context.Background(), bson.M{"sessionId": payload.SessionID}).Err(); err != nil {
		c.JSON(http.StatusNotFound, models.PluginGatewayError{Code: "SESSION_NOT_FOUND", Message: "Session not found"})
		return
	}

	c.JSON(http.StatusNotImplemented, gin.H{
		"status":        "not-implemented",
		"destination":   payload.Destination,
		"sessionId":     payload.SessionID,
		"message":       "Export orchestration not yet implemented; use gateway contract for forward compatibility.",
		"retryAfterSec": 0,
	})
}

func (h *PluginGatewayHandler) negotiateVersion(requested string) (string, error) {
	if requested == "" {
		return h.supportedVersions[0], nil
	}
	for _, v := range h.supportedVersions {
		if strings.TrimSpace(requested) == v {
			return v, nil
		}
	}
	return "", fmt.Errorf("requested version %s is not supported", strings.TrimSpace(requested))
}

func (h *PluginGatewayHandler) buildManifest(version string) models.PluginManifest {
	rateReqs := 100
	windowSeconds := 60
	if h.cfg != nil {
		rateReqs = h.cfg.RateLimitReqs
		windowSeconds = h.cfg.RateLimitWindow
	}

	return models.PluginManifest{
		ContractVersion:   version,
		SupportedVersions: h.supportedVersions,
		Capabilities: []string{
			"readSessions",
			"fetchArtifacts",
			"triggerExport",
		},
		Endpoints: map[string]string{
			"manifest": "/api/v1/plugin/" + version + "/manifest",
			"list":     "/api/v1/plugin/" + version + "/sessions",
			"get":      "/api/v1/plugin/" + version + "/sessions/{id}",
			"export":   "/api/v1/plugin/" + version + "/exports",
		},
		Auth: models.PluginAuth{
			Type:        "apiKey",
			Header:      "X-Project-Key",
			Description: "Use project-scoped API key for plugin calls",
		},
		RateLimits: models.PluginRateLimits{
			RequestsPerWindow: rateReqs,
			WindowSeconds:     windowSeconds,
			BurstAllowance:    rateReqs,
			Notes:             "Apply client-side backoff on HTTP 429",
		},
		Telemetry: models.PluginTelemetry{
			RequestIDHeader: "X-Request-ID",
			Metrics:         []string{"latency_ms", "status_code", "rate_limit_hits"},
			Logs:            []string{"request_id", "plugin_version"},
		},
		ErrorCodes: []string{
			"UNSUPPORTED_VERSION",
			"INVALID_PAYLOAD",
			"SESSION_NOT_FOUND",
			"DB_FIND_ERROR",
			"DB_COUNT_ERROR",
		},
		CompatibilityNote: "Contract is versioned; provide X-Plugin-Version header to negotiate.",
	}
}

func (h *PluginGatewayHandler) signMedia(media models.Media) map[string]interface{} {
	if h.minioClient == nil {
		return map[string]interface{}{}
	}

	result := map[string]interface{}{}

	if media.ScreenshotKey != "" {
		if signed, err := h.minioClient.GetPresignedURL(context.Background(), media.ScreenshotKey, time.Hour); err == nil {
			result["screenshot"] = signed
		}
	}

	if media.VideoKey != "" {
		if signed, err := h.minioClient.GetPresignedURL(context.Background(), media.VideoKey, time.Hour); err == nil {
			result["video"] = signed
		}
	}

	if len(media.DOMSnapshots) > 0 {
		domSigned := make([]string, 0, len(media.DOMSnapshots))
		for _, key := range media.DOMSnapshots {
			if signed, err := h.minioClient.GetPresignedURL(context.Background(), key, time.Hour); err == nil {
				domSigned = append(domSigned, signed)
			}
		}
		if len(domSigned) > 0 {
			result["domSnapshots"] = domSigned
		}
	}

	return result
}
