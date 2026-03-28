package middleware

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/config"
	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/security"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func migrateAndAuditProjectSecrets(ctx context.Context, c *gin.Context, db *database.Database, cfg *config.Config, project bson.M, projectID string) error {
	encryptor, err := security.NewEncryptor(cfg.EncryptionKey)
	if err != nil {
		return err
	}

	setUpdates := bson.M{}
	unsetUpdates := bson.M{}
	changedFields := make([]string, 0)

	if rawAPIKey, ok := project["apiKey"].(string); ok && strings.TrimSpace(rawAPIKey) != "" {
		encryptedAPIKey, err := encryptor.Encrypt(rawAPIKey)
		if err != nil {
			return err
		}
		setUpdates["apiKeyEncrypted"] = encryptedAPIKey
		setUpdates["apiKeyHash"] = hashAPIKey(rawAPIKey, cfg.APIKeySecret)
		unsetUpdates["apiKey"] = ""
		changedFields = append(changedFields, "apiKey")
	}

	nestedChanges, err := collectSensitiveUpdates(project, "", encryptor)
	if err != nil {
		return err
	}
	for path, value := range nestedChanges {
		setUpdates[path] = value
		changedFields = append(changedFields, path)
	}

	if len(setUpdates) == 0 && len(unsetUpdates) == 0 {
		return nil
	}

	setUpdates["secretsUpdatedAt"] = time.Now().UTC()

	update := bson.M{"$set": setUpdates}
	if len(unsetUpdates) > 0 {
		update["$unset"] = unsetUpdates
	}

	filter := bson.M{"projectId": projectID}
	if objectID, ok := project["_id"].(primitive.ObjectID); ok {
		filter = bson.M{"_id": objectID}
	}

	if _, err := db.Projects.UpdateOne(ctx, filter, update); err != nil {
		return err
	}

	recordAuditLog(ctx, c, db, projectID, "config_updated", "project-key", projectID, bson.M{
		"changeType":    "secret_encryption_migration",
		"changedFields": changedFields,
	})

	return nil
}

func collectSensitiveUpdates(node interface{}, basePath string, encryptor *security.Encryptor) (map[string]string, error) {
	updates := make(map[string]string)
	switch cast := node.(type) {
	case bson.M:
		for key, value := range cast {
			path := joinPath(basePath, key)
			if path == "apiKey" {
				continue
			}
			if sensitiveField(key) {
				if plain, ok := value.(string); ok && strings.TrimSpace(plain) != "" && !security.IsEncrypted(plain) {
					encrypted, err := encryptor.Encrypt(plain)
					if err != nil {
						return nil, err
					}
					updates[path] = encrypted
					continue
				}
			}
			nested, err := collectSensitiveUpdates(value, path, encryptor)
			if err != nil {
				return nil, err
			}
			for nestedPath, nestedValue := range nested {
				updates[nestedPath] = nestedValue
			}
		}
	case map[string]interface{}:
		asBson := bson.M(cast)
		return collectSensitiveUpdates(asBson, basePath, encryptor)
	case []interface{}:
		for index, value := range cast {
			path := joinPath(basePath, strconv.Itoa(index))
			nested, err := collectSensitiveUpdates(value, path, encryptor)
			if err != nil {
				return nil, err
			}
			for nestedPath, nestedValue := range nested {
				updates[nestedPath] = nestedValue
			}
		}
	}

	return updates, nil
}

func sensitiveField(key string) bool {
	normalized := strings.ToLower(strings.ReplaceAll(key, "_", ""))
	if strings.Contains(normalized, "hash") || strings.Contains(normalized, "encrypted") {
		return false
	}

	return strings.Contains(normalized, "apikey") || strings.Contains(normalized, "token") || strings.Contains(normalized, "secret") || strings.Contains(normalized, "password")
}

func joinPath(basePath string, field string) string {
	if basePath == "" {
		return field
	}
	return basePath + "." + field
}

func recordAuditLog(ctx context.Context, c *gin.Context, db *database.Database, projectID string, action string, actor string, resource string, details bson.M) {
	if db == nil || db.AuditLogs == nil {
		return
	}

	auditDoc := bson.M{
		"projectId":  projectID,
		"action":     action,
		"actor":      actor,
		"resource":   resource,
		"details":    details,
		"timestamp":  time.Now().UTC(),
		"ip":         c.ClientIP(),
		"userAgent":  c.GetHeader("User-Agent"),
	}

	_, _ = db.AuditLogs.InsertOne(ctx, auditDoc)
}
