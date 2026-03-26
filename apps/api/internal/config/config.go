package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port          string
	GinMode       string
	MongoURI      string
	MongoDatabase string
	MinioEndpoint string
	MinioAccessKey string
	MinioSecretKey string
	MinioBucket   string
	MinioUseSSL   bool
	APIKeySecret  string
	RateLimitReqs int
	RateLimitWindow int
}

func Load() *Config {
	rateLimitReqs, _ := strconv.Atoi(getEnv("RATE_LIMIT_REQUESTS", "100"))
	rateLimitWindow, _ := strconv.Atoi(getEnv("RATE_LIMIT_WINDOW", "60"))
	minioUseSSL, _ := strconv.ParseBool(getEnv("MINIO_USE_SSL", "false"))

	return &Config{
		Port:          getEnv("PORT", "3001"),
		GinMode:       getEnv("GIN_MODE", "debug"),
		MongoURI:      getEnv("MONGODB_URI", "mongodb://localhost:27017"),
		MongoDatabase: getEnv("MONGODB_DATABASE", "bugcatcher"),
		MinioEndpoint: getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinioSecretKey: getEnv("MINIO_SECRET_KEY", "minioadmin"),
		MinioBucket:   getEnv("MINIO_BUCKET", "bugcatcher-sessions"),
		MinioUseSSL:   minioUseSSL,
		APIKeySecret:  getEnv("API_KEY_SECRET", "change-me-in-production"),
		RateLimitReqs: rateLimitReqs,
		RateLimitWindow: rateLimitWindow,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
