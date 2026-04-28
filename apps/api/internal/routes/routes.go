package routes

import (
	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/handlers"
	"github.com/bugcatcher/api/internal/middleware"
	"github.com/bugcatcher/api/internal/storage"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func Setup(router *gin.Engine, db *database.Database, minioClient *storage.MinIOClient, cfg *config.Config) {
	// Health check
	router.GET("/health", handlers.HealthCheck)

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		pluginGateway := handlers.NewPluginGatewayHandler(db, minioClient, cfg)
		plugin := v1.Group("/plugin")
		plugin.Use(middleware.APIKeyAuth(db, cfg))
		plugin.Use(middleware.RateLimit(cfg))
		{
			pluginV1 := plugin.Group("/v1")
			pluginV1.GET("/manifest", pluginGateway.Manifest)
			pluginV1.GET("/sessions", pluginGateway.ListSessions)
			pluginV1.GET("/sessions/:id", pluginGateway.GetSession)
			pluginV1.POST("/exports", pluginGateway.TriggerExport)
		}

		// Sessions routes
		sessions := v1.Group("/sessions")
		sessions.Use(middleware.APIKeyAuth(db, cfg))
		sessions.Use(middleware.RateLimit(cfg))
		{
			sessionHandler := handlers.NewSessionHandler(db, minioClient, cfg)
			sessions.POST("", sessionHandler.Create)
			sessions.GET("", sessionHandler.List)
			sessions.PATCH("/batch/tags", sessionHandler.BatchUpdateTags)
			sessions.PATCH("/:id/tags", sessionHandler.UpdateTags)
			sessions.POST("/:id/comments", sessionHandler.AddComment)
			sessions.GET("/:id", sessionHandler.GetByID)
			sessions.DELETE("/:id", sessionHandler.Delete)
		}

		media := v1.Group("/media")
		media.Use(middleware.APIKeyAuth(db, cfg))
		media.Use(middleware.RateLimit(cfg))
		{
			mediaHandler := handlers.NewMediaHandler(cfg)
			media.POST("/screenshots", mediaHandler.StoreScreenshot)
			media.POST("/videos", mediaHandler.StoreVideo)
		}
	}

	// Swagger documentation
	router.GET("/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
}
