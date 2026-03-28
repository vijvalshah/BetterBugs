package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/bugcatcher/api/internal/config"
	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	visitors = make(map[string]*visitor)
	mu       sync.RWMutex
)

func RateLimit(cfg *config.Config) gin.HandlerFunc {
	// Cleanup old visitors every 5 minutes
	go cleanupVisitors()

	return func(c *gin.Context) {
		projectID, exists := c.Get("projectId")
		if !exists {
			projectID = c.ClientIP()
		}

		key := fmt.Sprint(projectID)

		rateLimitReqs := cfg.RateLimitReqs
		if value, ok := c.Get("rateLimitReqs"); ok {
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
		if value, ok := c.Get("rateLimitWindow"); ok {
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

		limiter := getVisitor(fmt.Sprintf("%s:%d:%d", key, rateLimitReqs, rateLimitWindow), rateLimitReqs, rateLimitWindow)

		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded",
				"code":  "RATE_LIMIT_EXCEEDED",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

func getVisitor(key string, rateLimitReqs int, rateLimitWindow int) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	v, exists := visitors[key]
	if !exists {
		limiter := rate.NewLimiter(rate.Limit(rateLimitReqs)/rate.Limit(rateLimitWindow), rateLimitReqs)
		visitors[key] = &visitor{limiter, time.Now()}
		return limiter
	}

	v.lastSeen = time.Now()
	return v.limiter
}

func cleanupVisitors() {
	for {
		time.Sleep(5 * time.Minute)
		mu.Lock()
		for key, v := range visitors {
			if time.Since(v.lastSeen) > 10*time.Minute {
				delete(visitors, key)
			}
		}
		mu.Unlock()
	}
}
