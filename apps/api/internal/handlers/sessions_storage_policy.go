package handlers

import (
	"context"
	"fmt"
	"math"
	"reflect"
	"time"

	"github.com/bugcatcher/api/internal/models"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type storagePolicy struct {
	MaxSessions   int64
	RetentionDays int
	WarningRatio  float64
}

type storagePolicyStatus struct {
	Utilization          float64 `json:"utilization"`
	Warning              string  `json:"warning,omitempty"`
	DeletedByRetention   int64   `json:"deletedByRetention"`
	DeletedByQuota       int64   `json:"deletedByQuota"`
	CurrentSessionCount  int64   `json:"currentSessionCount"`
	MaxSessionQuota      int64   `json:"maxSessionQuota"`
	RetentionWindowDays  int     `json:"retentionWindowDays"`
}

func (h *SessionHandler) enforceProjectStoragePolicy(ctx context.Context, projectID string, now time.Time) (storagePolicyStatus, error) {
	policy, err := h.resolveStoragePolicy(ctx, projectID)
	if err != nil {
		return storagePolicyStatus{}, err
	}

	deletedByRetention, err := h.applyRetentionPolicy(ctx, projectID, policy, now)
	if err != nil {
		return storagePolicyStatus{}, err
	}

	deletedByQuota, countAfterCleanup, err := h.applyQuotaPolicy(ctx, projectID, policy)
	if err != nil {
		return storagePolicyStatus{}, err
	}

	// Include the incoming session that is about to be inserted.
	projectedCount := countAfterCleanup + 1
	utilization := 0.0
	if policy.MaxSessions > 0 {
		utilization = float64(projectedCount) / float64(policy.MaxSessions)
		utilization = math.Round(utilization*1000) / 1000
	}

	status := storagePolicyStatus{
		Utilization:         utilization,
		DeletedByRetention:  deletedByRetention,
		DeletedByQuota:      deletedByQuota,
		CurrentSessionCount: projectedCount,
		MaxSessionQuota:     policy.MaxSessions,
		RetentionWindowDays: policy.RetentionDays,
	}
	if policy.WarningRatio > 0 && utilization >= policy.WarningRatio {
		status.Warning = fmt.Sprintf("project storage utilization is %.1f%% of quota", utilization*100)
	}

	return status, nil
}

func (h *SessionHandler) resolveStoragePolicy(ctx context.Context, projectID string) (storagePolicy, error) {
	policy := storagePolicy{
		MaxSessions:   h.cfg.StorageQuotaSessions,
		RetentionDays: h.cfg.StorageRetentionDays,
		WarningRatio:  h.cfg.StorageWarningRatio,
	}

	var projectDoc bson.M
	err := h.db.Projects.FindOne(ctx, bson.M{"projectId": projectID}).Decode(&projectDoc)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return policy, nil
		}
		return storagePolicy{}, err
	}

	if maxSessions, ok := readInt64(projectDoc, "storageQuotaSessions", "maxSessions"); ok && maxSessions > 0 {
		policy.MaxSessions = maxSessions
	}
	if retentionDays, ok := readInt(projectDoc, "storageRetentionDays", "retentionDays"); ok && retentionDays > 0 {
		policy.RetentionDays = retentionDays
	}
	if warningRatio, ok := readFloat64(projectDoc, "storageWarningRatio", "warningRatio"); ok && warningRatio > 0 && warningRatio <= 1 {
		policy.WarningRatio = warningRatio
	}

	if nestedPolicy, ok := projectDoc["storagePolicy"].(bson.M); ok {
		if maxSessions, ok := readInt64(nestedPolicy, "maxSessions"); ok && maxSessions > 0 {
			policy.MaxSessions = maxSessions
		}
		if retentionDays, ok := readInt(nestedPolicy, "retentionDays"); ok && retentionDays > 0 {
			policy.RetentionDays = retentionDays
		}
		if warningRatio, ok := readFloat64(nestedPolicy, "warningRatio"); ok && warningRatio > 0 && warningRatio <= 1 {
			policy.WarningRatio = warningRatio
		}
	}

	return policy, nil
}

func (h *SessionHandler) applyRetentionPolicy(ctx context.Context, projectID string, policy storagePolicy, now time.Time) (int64, error) {
	if policy.RetentionDays <= 0 {
		return 0, nil
	}

	cutoff := now.AddDate(0, 0, -policy.RetentionDays)
	cursor, err := h.db.Sessions.Find(
		ctx,
		bson.M{
			"projectId": projectID,
			"createdAt": bson.M{"$lt": cutoff},
		},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}),
	)
	if err != nil {
		return 0, err
	}
	defer cursor.Close(ctx)

	var sessions []models.Session
	if err := cursor.All(ctx, &sessions); err != nil {
		return 0, err
	}

	var deleted int64
	for _, session := range sessions {
		if err := h.deleteSessionArtifacts(ctx, session); err != nil {
			return deleted, err
		}
		deleted += 1
	}

	return deleted, nil
}

func (h *SessionHandler) applyQuotaPolicy(ctx context.Context, projectID string, policy storagePolicy) (int64, int64, error) {
	count, err := h.db.Sessions.CountDocuments(ctx, bson.M{"projectId": projectID})
	if err != nil {
		return 0, 0, err
	}

	if policy.MaxSessions <= 0 || count < policy.MaxSessions {
		return 0, count, nil
	}

	toDelete := count - policy.MaxSessions + 1
	if toDelete <= 0 {
		return 0, count, nil
	}

	cursor, err := h.db.Sessions.Find(
		ctx,
		bson.M{"projectId": projectID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(toDelete),
	)
	if err != nil {
		return 0, count, err
	}
	defer cursor.Close(ctx)

	var sessions []models.Session
	if err := cursor.All(ctx, &sessions); err != nil {
		return 0, count, err
	}

	var deleted int64
	for _, session := range sessions {
		if err := h.deleteSessionArtifacts(ctx, session); err != nil {
			return deleted, count - deleted, err
		}
		deleted += 1
	}

	return deleted, count - deleted, nil
}

func (h *SessionHandler) deleteSessionArtifacts(ctx context.Context, session models.Session) error {
	if err := h.deleteSessionMedia(ctx, session.Media); err != nil {
		return err
	}

	if _, err := h.db.Events.DeleteMany(ctx, bson.M{"sessionId": session.SessionID}); err != nil {
		return err
	}

	if _, err := h.db.Sessions.DeleteOne(ctx, bson.M{"sessionId": session.SessionID}); err != nil {
		return err
	}

	return nil
}

func (h *SessionHandler) deleteSessionMedia(ctx context.Context, media models.Media) error {
	if h.minioClient == nil {
		return nil
	}

	if media.ScreenshotKey != "" {
		if err := h.minioClient.DeleteObject(ctx, media.ScreenshotKey); err != nil {
			return err
		}
	}

	if media.VideoKey != "" {
		if err := h.minioClient.DeleteObject(ctx, media.VideoKey); err != nil {
			return err
		}
	}

	for _, key := range media.DOMSnapshots {
		if key == "" {
			continue
		}
		if err := h.minioClient.DeleteObject(ctx, key); err != nil {
			return err
		}
	}

	return nil
}

func readInt64(values bson.M, keys ...string) (int64, bool) {
	for _, key := range keys {
		if value, exists := values[key]; exists {
			switch cast := value.(type) {
			case int64:
				return cast, true
			case int32:
				return int64(cast), true
			case int:
				return int64(cast), true
			case float64:
				return int64(cast), true
			}
		}
	}
	return 0, false
}

func readInt(values bson.M, keys ...string) (int, bool) {
	for _, key := range keys {
		if value, exists := values[key]; exists {
			switch cast := value.(type) {
			case int:
				return cast, true
			case int32:
				return int(cast), true
			case int64:
				return int(cast), true
			case float64:
				return int(cast), true
			}
		}
	}
	return 0, false
}

func readFloat64(values bson.M, keys ...string) (float64, bool) {
	for _, key := range keys {
		if value, exists := values[key]; exists {
			kind := reflect.TypeOf(value)
			if kind == nil {
				continue
			}
			switch cast := value.(type) {
			case float64:
				return cast, true
			case float32:
				return float64(cast), true
			case int:
				return float64(cast), true
			case int64:
				return float64(cast), true
			}
		}
	}
	return 0, false
}
