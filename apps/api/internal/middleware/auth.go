package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"

	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

func APIKeyAuth(db *database.Database, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-Project-Key")
		if apiKey == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Missing X-Project-Key header",
				"code":  "AUTH_MISSING_KEY",
			})
			c.Abort()
			return
		}

		hash := hashAPIKey(apiKey, cfg.APIKeySecret)
		filter := bson.M{
			"$or": []bson.M{
				{"apiKeyHash": hash},
				{"apiKey": apiKey}, // Transitional compatibility for existing seeded docs.
			},
			"status": bson.M{"$ne": "disabled"},
		}

		var project bson.M
		err := db.Projects.FindOne(c.Request.Context(), filter).Decode(&project)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid project API key",
					"code":  "AUTH_INVALID_KEY",
				})
				c.Abort()
				return
			}

			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to validate project API key",
				"code":  "AUTH_LOOKUP_ERROR",
			})
			c.Abort()
			return
		}

		projectID := ""
		if value, ok := project["projectId"].(string); ok {
			projectID = value
		}
		if projectID == "" {
			if value, ok := project["_id"].(string); ok {
				projectID = value
			}
		}
		if projectID == "" {
			if value, ok := project["_id"].(primitive.ObjectID); ok {
				projectID = value.Hex()
			}
		}
		if projectID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Project API key is not attached to a valid project",
				"code":  "AUTH_INVALID_PROJECT",
			})
			c.Abort()
			return
		}

		if err := migrateAndAuditProjectSecrets(c.Request.Context(), c, db, cfg, project, projectID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to secure project secrets",
				"code":  "AUTH_SECRET_MIGRATION_ERROR",
			})
			c.Abort()
			return
		}

		rateLimitReqs := cfg.RateLimitReqs
		if value, ok := project["rateLimitRequests"]; ok {
			switch cast := value.(type) {
			case int:
				rateLimitReqs = cast
			case int32:
				rateLimitReqs = int(cast)
			case int64:
				rateLimitReqs = int(cast)
			case float64:
				rateLimitReqs = int(cast)
			}
		}

		rateLimitWindow := cfg.RateLimitWindow
		if value, ok := project["rateLimitWindow"]; ok {
			switch cast := value.(type) {
			case int:
				rateLimitWindow = cast
			case int32:
				rateLimitWindow = int(cast)
			case int64:
				rateLimitWindow = int(cast)
			case float64:
				rateLimitWindow = int(cast)
			}
		}

		if rateLimitReqs <= 0 {
			rateLimitReqs = cfg.RateLimitReqs
		}
		if rateLimitWindow <= 0 {
			rateLimitWindow = cfg.RateLimitWindow
		}

		c.Set("projectId", projectID)
		c.Set("rateLimitReqs", rateLimitReqs)
		c.Set("rateLimitWindow", rateLimitWindow)
		c.Next()
	}
}

func hashAPIKey(apiKey string, secret string) string {
	hash := sha256.Sum256([]byte(secret + ":" + apiKey))
	return hex.EncodeToString(hash[:])
}
