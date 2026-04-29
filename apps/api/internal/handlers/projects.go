package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/bugcatcher/api/internal/database"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ProjectHandler struct {
	db *database.Database
}

func NewProjectHandler(db *database.Database) *ProjectHandler {
	return &ProjectHandler{db: db}
}

// ProjectStats represents statistics for a project
type ProjectStats struct {
	TotalSessions     int64 `json:"totalSessions"`
	TotalErrors       int64 `json:"totalErrors"`
	TotalConsoleLogs  int64 `json:"totalConsoleLogs"`
	TotalNetworkReqs  int64 `json:"totalNetworkRequests"`
	TotalStateSnapShots int64 `json:"totalStateSnapshots"`
	SessionsWithErrors int64 `json:"sessionsWithErrors"`
	SessionsLast24h   int64 `json:"sessionsLast24h"`
	ErrorsLast24h     int64 `json:"errorsLast24h"`
}

// GetProjectStats godoc
// @Summary Get project statistics
// @Description Get aggregate statistics for a project
// @Tags projects
// @Produce json
// @Param id path string true "Project ID"
// @Success 200 {object} ProjectStats
// @Failure 404 {object} map[string]interface{}
// @Failure 500 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /projects/{id}/stats [get]
func (h *ProjectHandler) GetStats(c *gin.Context) {
	projectID := c.Param("id")
	ctx := c.Request.Context()

	// Verify project exists
	var project bson.M
	err := h.db.Projects.FindOne(ctx, bson.M{"projectId": projectID}).Decode(&project)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Project not found",
			"code": "PROJECT_NOT_FOUND",
		})
		return
	}

	// Calculate stats using aggregation pipeline
	stats, err := h.calculateProjectStats(ctx, projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to calculate project stats",
			"code": "STATS_CALCULATION_ERROR",
		})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *ProjectHandler) calculateProjectStats(ctx context.Context, projectID string) (ProjectStats, error) {
	stats := ProjectStats{}

	// Base filter for this project
	baseFilter := bson.M{"projectId": projectID}

	// Total sessions
	total, err := h.db.Sessions.CountDocuments(ctx, baseFilter)
	if err != nil {
		return stats, err
	}
	stats.TotalSessions = total

	// Sessions with errors (has error field)
	sessionsWithErrors, err := h.db.Sessions.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"error": bson.M{"$ne": nil},
	})
	if err != nil {
		return stats, err
	}
	stats.SessionsWithErrors = sessionsWithErrors
	stats.TotalErrors = sessionsWithErrors

	// Count console logs (from events collection)
	consoleCount, err := h.db.Events.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"type": "console",
	})
	if err != nil {
		return stats, err
	}
	stats.TotalConsoleLogs = consoleCount

	// Count network requests
	networkCount, err := h.db.Events.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"type": "network",
	})
	if err != nil {
		return stats, err
	}
	stats.TotalNetworkReqs = networkCount

	// Count state snapshots
	stateCount, err := h.db.Events.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"type": "state",
	})
	if err != nil {
		return stats, err
	}
	stats.TotalStateSnapShots = stateCount

	// Sessions in last 24h
	last24h := time.Now().Add(-24 * time.Hour)
	sessionsLast24h, err := h.db.Sessions.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"createdAt": bson.M{"$gte": last24h},
	})
	if err != nil {
		return stats, err
	}
	stats.SessionsLast24h = sessionsLast24h

	// Errors in last 24h
	errorsLast24h, err := h.db.Sessions.CountDocuments(ctx, bson.M{
		"projectId": projectID,
		"error":       bson.M{"$ne": nil},
		"createdAt":   bson.M{"$gte": last24h},
	})
	if err != nil {
		return stats, err
	}
	stats.ErrorsLast24h = errorsLast24h

	return stats, nil
}

// ListSessions godoc
// @Summary List project sessions
// @Description Get all sessions for a project
// @Tags projects
// @Produce json
// @Param id path string true "Project ID"
// @Param limit query int false "Limit"
// @Param offset query int false "Offset"
// @Success 200 {object} map[string]interface{}
// @Security ApiKeyAuth
// @Router /projects/{id}/sessions [get]
func (h *ProjectHandler) ListSessions(c *gin.Context) {
	projectID := c.Param("id")
	ctx := c.Request.Context()

	limit := int64(20)
	offset := int64(0)

	if l := c.Query("limit"); l != "" {
		if parsed, err := parseInt64(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := c.Query("offset"); o != "" {
		if parsed, err := parseInt64(o); err == nil && parsed > 0 {
			offset = parsed
		}
	}

	// Find sessions
	opts := options.Find().
		SetLimit(limit).
		SetSkip(offset).
		SetSort(bson.D{{Key: "createdAt", Value: -1}})

	cursor, err := h.db.Sessions.Find(ctx, bson.M{"projectId": projectID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch sessions",
			"code": "DB_FIND_ERROR",
		})
		return
	}
	defer cursor.Close(ctx)

	var sessions []bson.M
	if err := cursor.All(ctx, &sessions); err != nil {
		sessions = []bson.M{}
	}

	c.JSON(http.StatusOK, gin.H{
		"items":  sessions,
		"limit":  limit,
		"offset": offset,
	})
}

func parseInt64(s string) (int64, error) {
	var n int64
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}