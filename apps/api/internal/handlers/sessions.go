package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/models"
	"github.com/bugcatcher/api/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type SessionHandler struct {
	db          *database.Database
	minioClient *storage.MinIOClient
}

func NewSessionHandler(db *database.Database, minioClient *storage.MinIOClient) *SessionHandler {
	return &SessionHandler{
		db:          db,
		minioClient: minioClient,
	}
}

// Create godoc
// @Summary Create a new session
// @Description Create a new bug capture session
// @Tags sessions
// @Accept json
// @Produce json
// @Param session body models.SessionPayload true "Session data"
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /sessions [post]
func (h *SessionHandler) Create(c *gin.Context) {
	var payload models.SessionPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request payload",
			"code":    "INVALID_PAYLOAD",
			"details": []ValidationIssue{{
				Field: "payload",
				Issue: err.Error(),
			}},
		})
		return
	}

	if issues := validateSessionPayload(payload); len(issues) > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request payload",
			"code":    "INVALID_PAYLOAD",
			"details": issues,
		})
		return
	}

	// Generate session ID
	sessionID := uuid.New().String()

	// Generate error signature if error exists
	var errorSignature string
	if payload.Error != nil {
		hash := sha256.Sum256([]byte(payload.Error.Type + ":" + payload.Error.Message))
		errorSignature = hex.EncodeToString(hash[:])
		payload.Error.Signature = errorSignature
	}

	// Calculate stats
	stats := models.Stats{
		ConsoleCount:   0,
		NetworkCount:   0,
		StateSnapshots: 0,
	}
	for _, event := range payload.Events {
		switch event.Type {
		case "console":
			stats.ConsoleCount++
		case "network":
			stats.NetworkCount++
		case "state":
			stats.StateSnapshots++
		}
	}

	// Insert events first so session can persist event references.
	now := time.Now()
	eventRefs := make([]primitive.ObjectID, 0, len(payload.Events))
	if len(payload.Events) > 0 {
		events := make([]interface{}, len(payload.Events))
		for i, event := range payload.Events {
			event.SessionID = sessionID
			event.CreatedAt = now
			events[i] = event
		}

		eventInsertResult, err := h.db.Events.InsertMany(context.Background(), events)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to persist session events",
				"code":  "DB_EVENT_INSERT_ERROR",
			})
			return
		}

		for _, insertedID := range eventInsertResult.InsertedIDs {
			if objectID, ok := insertedID.(primitive.ObjectID); ok {
				eventRefs = append(eventRefs, objectID)
			}
		}
	}

	// Create session document
	session := models.Session{
		ProjectID:   payload.ProjectID,
		SessionID:   sessionID,
		URL:         payload.URL,
		Title:       payload.Title,
		Timestamp:   payload.Timestamp,
		Duration:    payload.Duration,
		Environment: payload.Environment,
		App:         payload.App,
		Error:       payload.Error,
		Media:       payload.Media,
		Tags:        []string{},
		Comments:    []models.SessionComment{},
		Operations: []models.SessionOperation{
			{
				Action: "session-created",
				Actor:  "system",
				At:     now,
				Details: map[string]interface{}{
					"eventRefs": len(eventRefs),
				},
			},
		},
		EventRefs:   eventRefs,
		Stats:       stats,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Insert session metadata.
	result, err := h.db.Sessions.InsertOne(context.Background(), session)
	if err != nil {
		if len(eventRefs) > 0 {
			_, _ = h.db.Events.DeleteMany(context.Background(), bson.M{"sessionId": sessionID})
		}

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create session",
			"code":  "DB_INSERT_ERROR",
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"sessionId": sessionID,
		"id":        result.InsertedID,
		"eventRefs": len(eventRefs),
	})
}

// List godoc
// @Summary List sessions
// @Description Get a paginated list of sessions
// @Tags sessions
// @Produce json
// @Param projectId query string false "Project ID"
// @Param url query string false "Filter by URL"
// @Param error query string false "Filter by error"
// @Param limit query int false "Limit" default(20)
// @Param offset query int false "Offset" default(0)
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /sessions [get]
func (h *SessionHandler) List(c *gin.Context) {
	// Build filter
	filter := bson.M{}

	if projectID := strings.TrimSpace(c.Query("projectId")); projectID != "" {
		filter["projectId"] = projectID
	}
	if url := strings.TrimSpace(c.Query("url")); url != "" {
		filter["url"] = bson.M{"$regex": url, "$options": "i"}
	}
	if errorQuery := strings.TrimSpace(c.Query("error")); errorQuery != "" {
		filter["error.message"] = bson.M{"$regex": errorQuery, "$options": "i"}
	}
	if tag := strings.TrimSpace(c.Query("tag")); tag != "" {
		filter["tags"] = tag
	}
	if hasError := strings.TrimSpace(strings.ToLower(c.Query("hasError"))); hasError != "" {
		switch hasError {
		case "true", "1", "yes":
			filter["error"] = bson.M{"$ne": nil}
		case "false", "0", "no":
			filter["error"] = nil
		default:
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid hasError filter",
				"code":  "INVALID_QUERY_PARAM",
				"details": []ValidationIssue{{
					Field: "hasError",
					Issue: "hasError must be one of: true,false,1,0,yes,no",
				}},
			})
			return
		}
	}

	if search := strings.TrimSpace(c.Query("q")); search != "" {
		pattern := bson.M{"$regex": search, "$options": "i"}
		filter["$or"] = []bson.M{
			{"url": pattern},
			{"title": pattern},
			{"error.message": pattern},
			{"tags": pattern},
			{"comments.body": pattern},
		}
	}

	createdAtFilter := bson.M{}
	if from := strings.TrimSpace(c.Query("from")); from != "" {
		parsed, err := time.Parse(time.RFC3339, from)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid from filter",
				"code":  "INVALID_QUERY_PARAM",
				"details": []ValidationIssue{{
					Field: "from",
					Issue: "from must be RFC3339 timestamp",
				}},
			})
			return
		}
		createdAtFilter["$gte"] = parsed
	}
	if to := strings.TrimSpace(c.Query("to")); to != "" {
		parsed, err := time.Parse(time.RFC3339, to)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid to filter",
				"code":  "INVALID_QUERY_PARAM",
				"details": []ValidationIssue{{
					Field: "to",
					Issue: "to must be RFC3339 timestamp",
				}},
			})
			return
		}
		createdAtFilter["$lte"] = parsed
	}
	if len(createdAtFilter) > 0 {
		filter["createdAt"] = createdAtFilter
	}

	// Pagination
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)
	offset, _ := strconv.ParseInt(c.DefaultQuery("offset", "0"), 10, 64)
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	allowedSortFields := map[string]string{
		"createdAt": "createdAt",
		"updatedAt": "updatedAt",
		"timestamp": "timestamp",
		"url":       "url",
	}
	sortBy := c.DefaultQuery("sortBy", "createdAt")
	sortField, ok := allowedSortFields[sortBy]
	if !ok {
		sortField = "createdAt"
		sortBy = "createdAt"
	}

	sortOrder := strings.ToLower(c.DefaultQuery("sortOrder", "desc"))
	sortDirection := int32(-1)
	if sortOrder == "asc" {
		sortDirection = 1
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	// Count total
	total, err := h.db.Sessions.CountDocuments(context.Background(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count sessions",
			"code":  "DB_COUNT_ERROR",
		})
		return
	}

	// Find sessions
	opts := options.Find().
		SetLimit(limit).
		SetSkip(offset).
		SetSort(bson.D{{Key: sortField, Value: sortDirection}})

	cursor, err := h.db.Sessions.Find(context.Background(), filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch sessions",
			"code":  "DB_FIND_ERROR",
		})
		return
	}
	defer cursor.Close(context.Background())

	items := make([]gin.H, 0)
	for cursor.Next(context.Background()) {
		var session models.Session
		if err := cursor.Decode(&session); err != nil {
			continue
		}

		summary := models.SessionSummary{
			ID:        session.ID,
			SessionID: session.SessionID,
			URL:       session.URL,
			Title:     session.Title,
			Timestamp: session.Timestamp,
			Error:     session.Error,
			Stats:     session.Stats,
			Tags:      session.Tags,
			CommentCount: len(session.Comments),
			Media:     session.Media,
			CreatedAt: session.CreatedAt,
		}

		item := gin.H{
			"id":           summary.ID,
			"sessionId":    summary.SessionID,
			"url":          summary.URL,
			"title":        summary.Title,
			"timestamp":    summary.Timestamp,
			"error":        summary.Error,
			"stats":        summary.Stats,
			"tags":         summary.Tags,
			"commentCount": summary.CommentCount,
			"media":        summary.Media,
			"createdAt":    summary.CreatedAt,
		}

		signedMedia := h.buildSignedMediaURLs(session.Media)
		if len(signedMedia) > 0 {
			item["signedMedia"] = signedMedia
		}

		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"limit":     limit,
		"offset":    offset,
		"sortBy":    sortBy,
		"sortOrder": sortOrder,
	})
}

// GetByID godoc
// @Summary Get session by ID
// @Description Get a session with all events
// @Tags sessions
// @Produce json
// @Param id path string true "Session ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /sessions/{id} [get]
func (h *SessionHandler) GetByID(c *gin.Context) {
	sessionID := c.Param("id")

	// Find session
	var session models.Session
	err := h.db.Sessions.FindOne(context.Background(), bson.M{"sessionId": sessionID}).Decode(&session)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Session not found",
			"code":  "SESSION_NOT_FOUND",
		})
		return
	}

	// Find events
	cursor, err := h.db.Events.Find(context.Background(), bson.M{"sessionId": sessionID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch events",
			"code":  "DB_FIND_ERROR",
		})
		return
	}
	defer cursor.Close(context.Background())

	var events []models.Event
	if err := cursor.All(context.Background(), &events); err != nil {
		events = []models.Event{}
	}

	signedMedia := h.buildSignedMediaURLs(session.Media)

	c.JSON(http.StatusOK, gin.H{
		"session":     session,
		"events":      events,
		"signedMedia": signedMedia,
	})
}

func (h *SessionHandler) buildSignedMediaURLs(media models.Media) map[string]interface{} {
	if h.minioClient == nil {
		return map[string]interface{}{}
	}

	result := map[string]interface{}{}

	if media.VideoKey != "" {
		if signedURL, err := h.minioClient.GetPresignedURL(context.Background(), media.VideoKey, time.Hour); err == nil {
			result["video"] = signedURL
		}
	}

	if len(media.DOMSnapshots) > 0 {
		domSigned := make([]string, 0, len(media.DOMSnapshots))
		for _, key := range media.DOMSnapshots {
			signedURL, err := h.minioClient.GetPresignedURL(context.Background(), key, time.Hour)
			if err != nil {
				continue
			}
			domSigned = append(domSigned, signedURL)
		}

		if len(domSigned) > 0 {
			result["domSnapshots"] = domSigned
		}
	}

	return result
}

// Delete godoc
// @Summary Delete session
// @Description Delete a session and all its events
// @Tags sessions
// @Produce json
// @Param id path string true "Session ID"
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /sessions/{id} [delete]
func (h *SessionHandler) Delete(c *gin.Context) {
	sessionID := c.Param("id")

	// Delete session
	result, err := h.db.Sessions.DeleteOne(context.Background(), bson.M{"sessionId": sessionID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete session",
			"code":  "DB_DELETE_ERROR",
		})
		return
	}

	if result.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Session not found",
			"code":  "SESSION_NOT_FOUND",
		})
		return
	}

	// Delete events
	h.db.Events.DeleteMany(context.Background(), bson.M{"sessionId": sessionID})

	c.JSON(http.StatusOK, gin.H{
		"message": "Session deleted successfully",
	})
}
