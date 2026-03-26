package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Session struct {
	ID          primitive.ObjectID `json:"id" bson:"_id,omitempty"`
	ProjectID   string             `json:"projectId" bson:"projectId"`
	SessionID   string             `json:"sessionId" bson:"sessionId"`
	URL         string             `json:"url" bson:"url"`
	Title       string             `json:"title,omitempty" bson:"title,omitempty"`
	Timestamp   time.Time          `json:"timestamp" bson:"timestamp"`
	Duration    int64              `json:"duration,omitempty" bson:"duration,omitempty"`
	Environment Environment        `json:"environment" bson:"environment"`
	App         App                `json:"app,omitempty" bson:"app,omitempty"`
	Error       *ErrorInfo         `json:"error,omitempty" bson:"error,omitempty"`
	Media       Media              `json:"media" bson:"media"`
	Stats       Stats              `json:"stats" bson:"stats"`
	UserID      string             `json:"userId,omitempty" bson:"userId,omitempty"`
	CreatedAt   time.Time          `json:"createdAt" bson:"createdAt"`
	UpdatedAt   time.Time          `json:"updatedAt" bson:"updatedAt"`
}

type Environment struct {
	Browser        string   `json:"browser" bson:"browser"`
	BrowserVersion string   `json:"browserVersion" bson:"browserVersion"`
	OS             string   `json:"os" bson:"os"`
	OSVersion      string   `json:"osVersion" bson:"osVersion"`
	Viewport       Viewport `json:"viewport" bson:"viewport"`
	Language       string   `json:"language" bson:"language"`
	Timezone       string   `json:"timezone,omitempty" bson:"timezone,omitempty"`
}

type Viewport struct {
	Width  int `json:"width" bson:"width"`
	Height int `json:"height" bson:"height"`
}

type App struct {
	Version      string            `json:"version,omitempty" bson:"version,omitempty"`
	CommitSha    string            `json:"commitSha,omitempty" bson:"commitSha,omitempty"`
	Branch       string            `json:"branch,omitempty" bson:"branch,omitempty"`
	FeatureFlags map[string]bool   `json:"featureFlags,omitempty" bson:"featureFlags,omitempty"`
}

type ErrorInfo struct {
	Message   string `json:"message" bson:"message"`
	Stack     string `json:"stack,omitempty" bson:"stack,omitempty"`
	Type      string `json:"type" bson:"type"`
	Signature string `json:"signature" bson:"signature"`
}

type Media struct {
	VideoKey     string   `json:"videoKey,omitempty" bson:"videoKey,omitempty"`
	DOMSnapshots []string `json:"domSnapshots,omitempty" bson:"domSnapshots,omitempty"`
	HasReplay    bool     `json:"hasReplay" bson:"hasReplay"`
}

type Stats struct {
	ConsoleCount   int `json:"consoleCount" bson:"consoleCount"`
	NetworkCount   int `json:"networkCount" bson:"networkCount"`
	StateSnapshots int `json:"stateSnapshots" bson:"stateSnapshots"`
}

// SessionPayload is the input DTO from extension
type SessionPayload struct {
	ProjectID   string      `json:"projectId" binding:"required"`
	URL         string      `json:"url" binding:"required"`
	Title       string      `json:"title"`
	Timestamp   time.Time   `json:"timestamp" binding:"required"`
	Duration    int64       `json:"duration"`
	Environment Environment `json:"environment" binding:"required"`
	App         App         `json:"app"`
	Error       *ErrorInfo  `json:"error"`
	Events      []Event     `json:"events"`
	Media       Media       `json:"media"`
}

// SessionSummary for list responses
type SessionSummary struct {
	ID        primitive.ObjectID `json:"id"`
	SessionID string             `json:"sessionId"`
	URL       string             `json:"url"`
	Title     string             `json:"title,omitempty"`
	Timestamp time.Time          `json:"timestamp"`
	Error     *ErrorInfo         `json:"error,omitempty"`
	Stats     Stats              `json:"stats"`
	CreatedAt time.Time          `json:"createdAt"`
}
