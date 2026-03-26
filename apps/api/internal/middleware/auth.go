package middleware

import (
	"net/http"

	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/gin-gonic/gin"
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

		// For Phase 1, we'll accept any non-empty key
		// In Phase 2+, validate against projects collection
		// TODO: Implement proper project lookup and key validation
		
		// Store project ID in context for handlers
		c.Set("projectId", "default-project")
		c.Next()
	}
}
