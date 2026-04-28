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
	MediaStorageDir string
	APIKeySecret  string
	EncryptionKey string
	RateLimitReqs int
	RateLimitWindow int
	StorageQuotaSessions int64
	StorageRetentionDays int
	StorageWarningRatio float64
}

func Load() *Config {
	rateLimitReqs, _ := strconv.Atoi(getEnv("RATE_LIMIT_REQUESTS", "100"))
	rateLimitWindow, _ := strconv.Atoi(getEnv("RATE_LIMIT_WINDOW", "60"))
	storageQuotaSessions, _ := strconv.ParseInt(getEnv("STORAGE_QUOTA_SESSIONS", "1000"), 10, 64)
	storageRetentionDays, _ := strconv.Atoi(getEnv("STORAGE_RETENTION_DAYS", "30"))
	storageWarningRatio, _ := strconv.ParseFloat(getEnv("STORAGE_WARNING_RATIO", "0.90"), 64)
	minioUseSSL, _ := strconv.ParseBool(getEnv("MINIO_USE_SSL", "false"))
	if storageQuotaSessions <= 0 {
		storageQuotaSessions = 1000
	}
	if storageRetentionDays <= 0 {
		storageRetentionDays = 30
	}
	if storageWarningRatio <= 0 || storageWarningRatio > 1 {
		storageWarningRatio = 0.90
	}

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
		MediaStorageDir: getEnv("MEDIA_STORAGE_DIR", "storage/media"),
		APIKeySecret:  getEnv("API_KEY_SECRET", "change-me-in-production"),
		EncryptionKey: getEnv("ENCRYPTION_KEY", "change-me-with-32-byte-key"),
		RateLimitReqs: rateLimitReqs,
		RateLimitWindow: rateLimitWindow,
		StorageQuotaSessions: storageQuotaSessions,
		StorageRetentionDays: storageRetentionDays,
		StorageWarningRatio: storageWarningRatio,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
