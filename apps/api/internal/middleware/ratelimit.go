package middleware

import (
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

		key := projectID.(string)
		limiter := getVisitor(key, cfg)

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

func getVisitor(key string, cfg *config.Config) *rate.Limiter {
	mu.Lock()
	defer mu.Unlock()

	v, exists := visitors[key]
	if !exists {
		limiter := rate.NewLimiter(rate.Limit(cfg.RateLimitReqs)/rate.Limit(cfg.RateLimitWindow), cfg.RateLimitReqs)
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
