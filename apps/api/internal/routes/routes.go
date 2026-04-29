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

	// Public share view
	shareHandler := handlers.NewShareHandler(db)
	router.GET("/share/:id", shareHandler.ShareView)

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

			// Analysis endpoints (for MCP/Dashboard AI)
			sessions.POST("/:id/analyze", sessionHandler.Analyze)
			sessions.GET("/:id/analysis", sessionHandler.GetAnalysis)
		}

		// Projects routes
		projects := v1.Group("/projects")
		projects.Use(middleware.APIKeyAuth(db, cfg))
		projects.Use(middleware.RateLimit(cfg))
		{
			projectHandler := handlers.NewProjectHandler(db)
			projects.GET("/:id/stats", projectHandler.GetStats)
			projects.GET("/:id/sessions", projectHandler.ListSessions)
		}

		media := v1.Group("/media")
		media.Use(middleware.APIKeyAuth(db, cfg))
		media.Use(middleware.RateLimit(cfg))
		{
			mediaHandler := handlers.NewMediaHandler(cfg)
			media.POST("/screenshots", mediaHandler.StoreScreenshot)
			media.POST("/videos", mediaHandler.StoreVideo)
		}

		uploads := v1.Group("/uploads")
		uploads.Use(middleware.APIKeyAuth(db, cfg))
		uploads.Use(middleware.RateLimit(cfg))
		{
			uploadHandler := handlers.NewUploadSessionHandler(db, minioClient, cfg)
			uploads.POST("/sessions", uploadHandler.CreateUploadSession)
			uploads.POST("/sessions/:id/finalize", uploadHandler.FinalizeUploadSession)
		}
	}

	// Swagger documentation
	router.GET("/docs/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
}