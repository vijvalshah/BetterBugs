package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Session struct {
	ID            primitive.ObjectID   `json:"id" bson:"_id,omitempty"`
	ProjectID     string               `json:"projectId" bson:"projectId"`
	SessionID     string               `json:"sessionId" bson:"sessionId"`
	URL           string               `json:"url" bson:"url"`
	Title         string               `json:"title,omitempty" bson:"title,omitempty"`
	Timestamp     time.Time            `json:"timestamp" bson:"timestamp"`
	Duration      int64                `json:"duration,omitempty" bson:"duration,omitempty"`
	Environment   Environment          `json:"environment" bson:"environment"`
	App           App                  `json:"app,omitempty" bson:"app,omitempty"`
	Error         *ErrorInfo           `json:"error,omitempty" bson:"error,omitempty"`
	Media         Media                `json:"media" bson:"media"`
	Tags          []string             `json:"tags,omitempty" bson:"tags,omitempty"`
	Comments      []SessionComment     `json:"comments,omitempty" bson:"comments,omitempty"`
	Operations    []SessionOperation   `json:"operations,omitempty" bson:"operations,omitempty"`
	EventRefs     []primitive.ObjectID `json:"eventRefs,omitempty" bson:"eventRefs,omitempty"`
	Stats         Stats                `json:"stats" bson:"stats"`
	TriageSummary TriageSummary        `json:"triageSummary,omitempty" bson:"triageSummary,omitempty"`
	UserID        string               `json:"userId,omitempty" bson:"userId,omitempty"`
	CreatedAt     time.Time            `json:"createdAt" bson:"createdAt"`
	UpdatedAt     time.Time            `json:"updatedAt" bson:"updatedAt"`
}

type TriageSummary struct {
	HasUsefulSignal      bool                    `json:"hasUsefulSignal" bson:"hasUsefulSignal"`
	ErrorCount           int                     `json:"errorCount,omitempty" bson:"errorCount,omitempty"`
	FirstErrorAtMs       int64                   `json:"firstErrorAtMs,omitempty" bson:"firstErrorAtMs,omitempty"`
	LastErrorAtMs        int64                   `json:"lastErrorAtMs,omitempty" bson:"lastErrorAtMs,omitempty"`
	TopErrorMessage      string                  `json:"topErrorMessage,omitempty" bson:"topErrorMessage,omitempty"`
	ConsoleErrorCount    int                     `json:"consoleErrorCount,omitempty" bson:"consoleErrorCount,omitempty"`
	ConsoleWarnCount     int                     `json:"consoleWarnCount,omitempty" bson:"consoleWarnCount,omitempty"`
	RequestCount         int                     `json:"requestCount,omitempty" bson:"requestCount,omitempty"`
	FailedRequestCount   int                     `json:"failedRequestCount,omitempty" bson:"failedRequestCount,omitempty"`
	StatusHistogram      map[string]int          `json:"statusHistogram,omitempty" bson:"statusHistogram,omitempty"`
	P95NetworkDurationMs int64                   `json:"p95NetworkDurationMs,omitempty" bson:"p95NetworkDurationMs,omitempty"`
	TopFailingEndpoints  []NetworkEndpointTriage `json:"topFailingEndpoints,omitempty" bson:"topFailingEndpoints,omitempty"`
	StateSnapshotCount   int                     `json:"stateSnapshotCount,omitempty" bson:"stateSnapshotCount,omitempty"`
	ChangedSnapshotCount int                     `json:"changedSnapshotCount,omitempty" bson:"changedSnapshotCount,omitempty"`
}

type NetworkEndpointTriage struct {
	Method string `json:"method" bson:"method"`
	Path   string `json:"path" bson:"path"`
	Count  int    `json:"count" bson:"count"`
}

type SessionComment struct {
	ID        string    `json:"id" bson:"id"`
	Author    string    `json:"author,omitempty" bson:"author,omitempty"`
	Body      string    `json:"body" bson:"body"`
	CreatedAt time.Time `json:"createdAt" bson:"createdAt"`
}

type SessionOperation struct {
	Action  string                 `json:"action" bson:"action"`
	Actor   string                 `json:"actor,omitempty" bson:"actor,omitempty"`
	At      time.Time              `json:"at" bson:"at"`
	Details map[string]interface{} `json:"details,omitempty" bson:"details,omitempty"`
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
	Version      string          `json:"version,omitempty" bson:"version,omitempty"`
	CommitSha    string          `json:"commitSha,omitempty" bson:"commitSha,omitempty"`
	Branch       string          `json:"branch,omitempty" bson:"branch,omitempty"`
	FeatureFlags map[string]bool `json:"featureFlags,omitempty" bson:"featureFlags,omitempty"`
}

type ErrorInfo struct {
	Message   string `json:"message" bson:"message"`
	Stack     string `json:"stack,omitempty" bson:"stack,omitempty"`
	Type      string `json:"type" bson:"type"`
	Signature string `json:"signature" bson:"signature"`
}

type Media struct {
	ScreenshotKey string   `json:"screenshotKey,omitempty" bson:"screenshotKey,omitempty"`
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
	ID            primitive.ObjectID `json:"id"`
	SessionID     string             `json:"sessionId"`
	URL           string             `json:"url"`
	Title         string             `json:"title,omitempty"`
	Timestamp     time.Time          `json:"timestamp"`
	Error         *ErrorInfo         `json:"error,omitempty"`
	Stats         Stats              `json:"stats"`
	Tags          []string           `json:"tags,omitempty"`
	CommentCount  int                `json:"commentCount"`
	Media         Media              `json:"media"`
	TriageSummary TriageSummary      `json:"triageSummary,omitempty"`
	CreatedAt     time.Time          `json:"createdAt"`
}
