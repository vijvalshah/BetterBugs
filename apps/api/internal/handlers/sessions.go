package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
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
			"details": err.Error(),
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

	// Create session document
	now := time.Now()
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
		Stats:       stats,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Insert session
	result, err := h.db.Sessions.InsertOne(context.Background(), session)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create session",
			"code":  "DB_INSERT_ERROR",
		})
		return
	}

	// Insert events
	if len(payload.Events) > 0 {
		events := make([]interface{}, len(payload.Events))
		for i, event := range payload.Events {
			event.SessionID = sessionID
			event.CreatedAt = now
			events[i] = event
		}
		_, err := h.db.Events.InsertMany(context.Background(), events)
		if err != nil {
			// Log error but don't fail the request
			// TODO: Add proper logging
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"sessionId": sessionID,
		"id":        result.InsertedID,
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
	
	if projectID := c.Query("projectId"); projectID != "" {
		filter["projectId"] = projectID
	}
	if url := c.Query("url"); url != "" {
		filter["url"] = bson.M{"$regex": url, "$options": "i"}
	}
	if errorQuery := c.Query("error"); errorQuery != "" {
		filter["error.message"] = bson.M{"$regex": errorQuery, "$options": "i"}
	}

	// Pagination
	limit, _ := strconv.ParseInt(c.DefaultQuery("limit", "20"), 10, 64)
	offset, _ := strconv.ParseInt(c.DefaultQuery("offset", "0"), 10, 64)

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
		SetSort(bson.D{{Key: "createdAt", Value: -1}})

	cursor, err := h.db.Sessions.Find(context.Background(), filter, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch sessions",
			"code":  "DB_FIND_ERROR",
		})
		return
	}
	defer cursor.Close(context.Background())

	var sessions []models.SessionSummary
	for cursor.Next(context.Background()) {
		var session models.Session
		if err := cursor.Decode(&session); err != nil {
			continue
		}
		sessions = append(sessions, models.SessionSummary{
			ID:        session.ID,
			SessionID: session.SessionID,
			URL:       session.URL,
			Title:     session.Title,
			Timestamp: session.Timestamp,
			Error:     session.Error,
			Stats:     session.Stats,
			CreatedAt: session.CreatedAt,
		})
	}

	if sessions == nil {
		sessions = []models.SessionSummary{}
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  sessions,
		"total":  total,
		"limit":  limit,
		"offset": offset,
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

	c.JSON(http.StatusOK, gin.H{
		"session": session,
		"events":  events,
	})
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
