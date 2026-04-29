package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type UploadArtifact struct {
	Key         string `json:"key" bson:"key"`
	ContentType string `json:"contentType,omitempty" bson:"contentType,omitempty"`
	SizeBytes   int64  `json:"sizeBytes,omitempty" bson:"sizeBytes,omitempty"`
}

type UploadSession struct {
	ID           primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	UploadID     string             `json:"uploadId" bson:"uploadId"`
	ProjectID    string             `json:"projectId" bson:"projectId"`
	SessionID    string             `json:"sessionId" bson:"sessionId"`
	Status       string             `json:"status" bson:"status"`
	HasReplay    bool               `json:"hasReplay" bson:"hasReplay"`
	Screenshot   *UploadArtifact    `json:"screenshot,omitempty" bson:"screenshot,omitempty"`
	Video        *UploadArtifact    `json:"video,omitempty" bson:"video,omitempty"`
	DOMSnapshots []UploadArtifact   `json:"domSnapshots,omitempty" bson:"domSnapshots,omitempty"`
	CreatedAt    time.Time          `json:"createdAt" bson:"createdAt"`
	ExpiresAt    time.Time          `json:"expiresAt" bson:"expiresAt"`
	FinalizedAt  *time.Time         `json:"finalizedAt,omitempty" bson:"finalizedAt,omitempty"`
}
