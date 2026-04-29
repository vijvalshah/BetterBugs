package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/config"
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
	cfg         *config.Config
}

type sessionCreateResult struct {
	sessionID     string
	insertedID    interface{}
	eventRefs     int
	storageStatus storagePolicyStatus
}

type sessionCreateError struct {
	status  int
	code    string
	message string
	details []ValidationIssue
}

func NewSessionHandler(db *database.Database, minioClient *storage.MinIOClient, cfg *config.Config) *SessionHandler {
	return &SessionHandler{
		db:          db,
		minioClient: minioClient,
		cfg:         cfg,
	}
}

func (h *SessionHandler) createSessionWithID(
	ctx context.Context,
	payload models.SessionPayload,
	sessionID string,
) (sessionCreateResult, *sessionCreateError) {
	if sessionID == "" {
		sessionID = uuid.New().String()
	}

	var errorSignature string
	if payload.Error != nil {
		hash := sha256.Sum256([]byte(payload.Error.Type + ":" + payload.Error.Message))
		errorSignature = hex.EncodeToString(hash[:])
		payload.Error.Signature = errorSignature
	}

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

	triageSummary := buildTriageSummary(payload, stats)

	now := time.Now()
	storageStatus, err := h.enforceProjectStoragePolicy(ctx, payload.ProjectID, now)
	if err != nil {
		return sessionCreateResult{}, &sessionCreateError{
			status:  http.StatusServiceUnavailable,
			code:    "STORAGE_POLICY_ERROR",
			message: "Failed to enforce project storage policy",
			details: []ValidationIssue{{
				Field: "project.storagePolicy",
				Issue: err.Error(),
			}},
		}
	}

	eventRefs := make([]primitive.ObjectID, 0, len(payload.Events))
	if len(payload.Events) > 0 {
		events := make([]interface{}, len(payload.Events))
		for i, event := range payload.Events {
			event.SessionID = sessionID
			event.CreatedAt = now
			events[i] = event
		}

		eventInsertResult, err := h.db.Events.InsertMany(ctx, events)
		if err != nil {
			return sessionCreateResult{}, &sessionCreateError{
				status:  http.StatusInternalServerError,
				code:    "DB_EVENT_INSERT_ERROR",
				message: "Failed to persist session events",
			}
		}

		for _, insertedID := range eventInsertResult.InsertedIDs {
			if objectID, ok := insertedID.(primitive.ObjectID); ok {
				eventRefs = append(eventRefs, objectID)
			}
		}
	}

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
		EventRefs:     eventRefs,
		Stats:         stats,
		TriageSummary: triageSummary,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	result, err := h.db.Sessions.InsertOne(ctx, session)
	if err != nil {
		if len(eventRefs) > 0 {
			_, _ = h.db.Events.DeleteMany(ctx, bson.M{"sessionId": sessionID})
		}

		return sessionCreateResult{}, &sessionCreateError{
			status:  http.StatusInternalServerError,
			code:    "DB_INSERT_ERROR",
			message: "Failed to create session",
		}
	}

	return sessionCreateResult{
		sessionID:     sessionID,
		insertedID:    result.InsertedID,
		eventRefs:     len(eventRefs),
		storageStatus: storageStatus,
	}, nil
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
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
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

	result, createErr := h.createSessionWithID(c.Request.Context(), payload, "")
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

	c.JSON(http.StatusCreated, gin.H{
		"sessionId": result.sessionID,
		"id":        result.insertedID,
		"eventRefs": result.eventRefs,
		"storage":   result.storageStatus,
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
			ID:            session.ID,
			SessionID:     session.SessionID,
			URL:           session.URL,
			Title:         session.Title,
			Timestamp:     session.Timestamp,
			Error:         session.Error,
			Stats:         session.Stats,
			Tags:          session.Tags,
			CommentCount:  len(session.Comments),
			Media:         session.Media,
			TriageSummary: session.TriageSummary,
			CreatedAt:     session.CreatedAt,
		}

		item := gin.H{
			"id":            summary.ID,
			"sessionId":     summary.SessionID,
			"url":           summary.URL,
			"title":         summary.Title,
			"timestamp":     summary.Timestamp,
			"error":         summary.Error,
			"stats":         summary.Stats,
			"tags":          summary.Tags,
			"commentCount":  summary.CommentCount,
			"media":         summary.Media,
			"triageSummary": summary.TriageSummary,
			"createdAt":     summary.CreatedAt,
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

func buildTriageSummary(payload models.SessionPayload, stats models.Stats) models.TriageSummary {
	summary := models.TriageSummary{
		StatusHistogram: make(map[string]int),
	}

	if payload.Error != nil {
		summary.TopErrorMessage = strings.TrimSpace(payload.Error.Message)
	}

	var networkDurations []int64
	failingEndpointCounts := make(map[string]int)

	for _, event := range payload.Events {
		timestamp := event.Timestamp
		eventPayload := toStringMap(event.Payload)

		switch event.Type {
		case "error":
			summary.ErrorCount++
			if summary.FirstErrorAtMs == 0 || (timestamp > 0 && timestamp < summary.FirstErrorAtMs) {
				summary.FirstErrorAtMs = timestamp
			}
			if timestamp > summary.LastErrorAtMs {
				summary.LastErrorAtMs = timestamp
			}
			if summary.TopErrorMessage == "" {
				summary.TopErrorMessage = getString(eventPayload, "message")
			}

		case "console":
			level := strings.ToLower(getString(eventPayload, "level"))
			if level == "error" {
				summary.ConsoleErrorCount++
			}
			if level == "warn" || level == "warning" {
				summary.ConsoleWarnCount++
			}

		case "network":
			summary.RequestCount++
			status := getInt(eventPayload, "status")
			if status > 0 {
				summary.StatusHistogram[strconv.Itoa(status)]++
				if status >= 400 {
					summary.FailedRequestCount++
					method := strings.ToUpper(getString(eventPayload, "method"))
					if method == "" {
						method = "GET"
					}
					path := extractPath(getString(eventPayload, "url"))
					key := method + " " + path
					failingEndpointCounts[key]++
				}
			}

			timing := toStringMap(eventPayload["timing"])
			duration := getInt64(timing, "duration")
			if duration > 0 {
				networkDurations = append(networkDurations, duration)
			}

		case "state":
			summary.StateSnapshotCount++
			if getBool(eventPayload, "changed") {
				summary.ChangedSnapshotCount++
			}
		}
	}

	if summary.TopErrorMessage == "" && payload.Error != nil {
		summary.TopErrorMessage = strings.TrimSpace(payload.Error.Message)
	}

	if len(networkDurations) > 0 {
		sort.Slice(networkDurations, func(i, j int) bool {
			return networkDurations[i] < networkDurations[j]
		})
		index := (95*len(networkDurations) - 1) / 100
		if index < 0 {
			index = 0
		}
		if index >= len(networkDurations) {
			index = len(networkDurations) - 1
		}
		summary.P95NetworkDurationMs = networkDurations[index]
	}

	type endpointCounter struct {
		method string
		path   string
		count  int
	}

	endpointCounts := make([]endpointCounter, 0, len(failingEndpointCounts))
	for key, count := range failingEndpointCounts {
		parts := strings.SplitN(key, " ", 2)
		method := "GET"
		path := "/"
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			method = parts[0]
		}
		if len(parts) == 2 && strings.TrimSpace(parts[1]) != "" {
			path = parts[1]
		}
		endpointCounts = append(endpointCounts, endpointCounter{method: method, path: path, count: count})
	}

	sort.Slice(endpointCounts, func(i, j int) bool {
		if endpointCounts[i].count == endpointCounts[j].count {
			return endpointCounts[i].path < endpointCounts[j].path
		}
		return endpointCounts[i].count > endpointCounts[j].count
	})

	for i := 0; i < len(endpointCounts) && i < 3; i++ {
		summary.TopFailingEndpoints = append(summary.TopFailingEndpoints, models.NetworkEndpointTriage{
			Method: endpointCounts[i].method,
			Path:   endpointCounts[i].path,
			Count:  endpointCounts[i].count,
		})
	}

	if len(summary.StatusHistogram) == 0 {
		summary.StatusHistogram = nil
	}

	summary.HasUsefulSignal =
		summary.ErrorCount > 0 ||
			summary.ConsoleErrorCount > 0 ||
			summary.FailedRequestCount > 0 ||
			summary.StateSnapshotCount > 0 ||
			stats.ConsoleCount > 0 ||
			stats.NetworkCount > 0

	return summary
}

func toStringMap(value interface{}) map[string]interface{} {
	mapped, ok := value.(map[string]interface{})
	if ok {
		return mapped
	}
	return map[string]interface{}{}
}

func getString(source map[string]interface{}, key string) string {
	value, ok := source[key]
	if !ok || value == nil {
		return ""
	}
	if cast, ok := value.(string); ok {
		return strings.TrimSpace(cast)
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func getInt(source map[string]interface{}, key string) int {
	return int(getInt64(source, key))
}

func getInt64(source map[string]interface{}, key string) int64 {
	value, ok := source[key]
	if !ok || value == nil {
		return 0
	}

	switch cast := value.(type) {
	case int:
		return int64(cast)
	case int32:
		return int64(cast)
	case int64:
		return cast
	case float32:
		return int64(cast)
	case float64:
		return int64(cast)
	case string:
		parsed, err := strconv.ParseInt(strings.TrimSpace(cast), 10, 64)
		if err == nil {
			return parsed
		}
	}

	return 0
}

func getBool(source map[string]interface{}, key string) bool {
	value, ok := source[key]
	if !ok || value == nil {
		return false
	}

	switch cast := value.(type) {
	case bool:
		return cast
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(cast))
		if err == nil {
			return parsed
		}
	}

	return false
}

func extractPath(rawURL string) string {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return "/"
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return trimmed
	}
	if parsed.Path == "" {
		return "/"
	}
	return parsed.Path
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

	if media.ScreenshotKey != "" {
		if signedURL, err := h.minioClient.GetPresignedURL(context.Background(), media.ScreenshotKey, time.Hour); err == nil {
			result["screenshot"] = signedURL
		}
	}

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
	ctx := c.Request.Context()

	var session models.Session
	err := h.db.Sessions.FindOne(ctx, bson.M{"sessionId": sessionID}).Decode(&session)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Session not found",
			"code":  "SESSION_NOT_FOUND",
		})
		return
	}

	if err := h.deleteSessionArtifacts(ctx, session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete session",
			"code":  "DB_DELETE_ERROR",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Session deleted successfully",
	})
}
