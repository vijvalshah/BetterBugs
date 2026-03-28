package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
)

type UpdateSessionTagsRequest struct {
	Add    []string `json:"add"`
	Remove []string `json:"remove"`
	Actor  string   `json:"actor"`
}

type AddSessionCommentRequest struct {
	Body   string `json:"body"`
	Author string `json:"author"`
}

type BatchUpdateTagsRequest struct {
	SessionIDs []string `json:"sessionIds"`
	Add        []string `json:"add"`
	Remove     []string `json:"remove"`
	Actor      string   `json:"actor"`
}

func normalizeTagValues(input []string) []string {
	normalized := make([]string, 0, len(input))
	seen := map[string]struct{}{}

	for _, raw := range input {
		tag := strings.ToLower(strings.TrimSpace(raw))
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		normalized = append(normalized, tag)
	}

	return normalized
}

func normalizeSessionIDs(input []string) []string {
	normalized := make([]string, 0, len(input))
	seen := map[string]struct{}{}

	for _, raw := range input {
		sessionID := strings.TrimSpace(raw)
		if sessionID == "" {
			continue
		}
		if _, exists := seen[sessionID]; exists {
			continue
		}
		seen[sessionID] = struct{}{}
		normalized = append(normalized, sessionID)
	}

	return normalized
}

func actorOrSystem(actor string) string {
	trimmed := strings.TrimSpace(actor)
	if trimmed == "" {
		return "system"
	}
	return trimmed
}

func buildTagMutationPipeline(addTags []string, removeTags []string, now time.Time, operation models.SessionOperation) bson.A {
	return bson.A{
		bson.M{
			"$set": bson.M{
				"updatedAt": now,
				"tags": bson.M{
					"$setDifference": bson.A{
						bson.M{
							"$setUnion": bson.A{
								bson.M{"$ifNull": bson.A{"$tags", bson.A{}}},
								addTags,
							},
						},
						removeTags,
					},
				},
				"operations": bson.M{
					"$concatArrays": bson.A{
						bson.M{"$ifNull": bson.A{"$operations", bson.A{}}},
						bson.A{operation},
					},
				},
			},
		},
	}
}

func (h *SessionHandler) UpdateTags(c *gin.Context) {
	sessionID := c.Param("id")

	var req UpdateSessionTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
		})
		return
	}

	addTags := normalizeTagValues(req.Add)
	removeTags := normalizeTagValues(req.Remove)
	if len(addTags) == 0 && len(removeTags) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No tag operations provided",
			"code":  "INVALID_OPERATION",
			"details": []ValidationIssue{{
				Field: "add/remove",
				Issue: "at least one tag in add or remove is required",
			}},
		})
		return
	}

	now := time.Now()
	operation := models.SessionOperation{
		Action: "tags-updated",
		Actor:  actorOrSystem(req.Actor),
		At:     now,
		Details: map[string]interface{}{
			"added":   addTags,
			"removed": removeTags,
		},
	}
	update := buildTagMutationPipeline(addTags, removeTags, now, operation)

	result, err := h.db.Sessions.UpdateOne(context.Background(), bson.M{"sessionId": sessionID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update tags",
			"code":  "DB_UPDATE_ERROR",
		})
		return
	}

	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Session not found",
			"code":  "SESSION_NOT_FOUND",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sessionId": sessionID,
		"added":    addTags,
		"removed":  removeTags,
		"matched":  result.MatchedCount,
		"modified": result.ModifiedCount,
	})
}

func (h *SessionHandler) AddComment(c *gin.Context) {
	sessionID := c.Param("id")

	var req AddSessionCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
		})
		return
	}

	body := strings.TrimSpace(req.Body)
	if body == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Comment body is required",
			"code":  "INVALID_OPERATION",
			"details": []ValidationIssue{{
				Field: "body",
				Issue: "comment body must not be empty",
			}},
		})
		return
	}

	now := time.Now()
	comment := models.SessionComment{
		ID:        uuid.New().String(),
		Author:    actorOrSystem(req.Author),
		Body:      body,
		CreatedAt: now,
	}

	result, err := h.db.Sessions.UpdateOne(
		context.Background(),
		bson.M{"sessionId": sessionID},
		bson.M{
			"$set": bson.M{"updatedAt": now},
			"$push": bson.M{
				"comments": comment,
				"operations": models.SessionOperation{
					Action: "comment-added",
					Actor:  actorOrSystem(req.Author),
					At:     now,
					Details: map[string]interface{}{
						"commentId": comment.ID,
					},
				},
			},
		},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to add comment",
			"code":  "DB_UPDATE_ERROR",
		})
		return
	}

	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Session not found",
			"code":  "SESSION_NOT_FOUND",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sessionId": sessionID,
		"comment":   comment,
	})
}

func (h *SessionHandler) BatchUpdateTags(c *gin.Context) {
	var req BatchUpdateTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code":  "INVALID_PAYLOAD",
		})
		return
	}

	sessionIDs := normalizeSessionIDs(req.SessionIDs)
	if len(sessionIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No session IDs provided",
			"code":  "INVALID_OPERATION",
			"details": []ValidationIssue{{
				Field: "sessionIds",
				Issue: "at least one valid session ID is required",
			}},
		})
		return
	}

	addTags := normalizeTagValues(req.Add)
	removeTags := normalizeTagValues(req.Remove)
	if len(addTags) == 0 && len(removeTags) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No tag operations provided",
			"code":  "INVALID_OPERATION",
			"details": []ValidationIssue{{
				Field: "add/remove",
				Issue: "at least one tag in add or remove is required",
			}},
		})
		return
	}

	now := time.Now()
	operation := models.SessionOperation{
		Action: "batch-tags-updated",
		Actor:  actorOrSystem(req.Actor),
		At:     now,
		Details: map[string]interface{}{
			"added":        addTags,
			"removed":      removeTags,
			"sessionCount": len(sessionIDs),
		},
	}
	update := buildTagMutationPipeline(addTags, removeTags, now, operation)

	result, err := h.db.Sessions.UpdateMany(
		context.Background(),
		bson.M{"sessionId": bson.M{"$in": sessionIDs}},
		update,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to apply batch update",
			"code":  "DB_UPDATE_ERROR",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"sessionIds": sessionIDs,
		"added":      addTags,
		"removed":    removeTags,
		"matched":    result.MatchedCount,
		"modified":   result.ModifiedCount,
	})
}
