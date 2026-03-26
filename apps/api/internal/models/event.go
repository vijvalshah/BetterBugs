package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Event struct {
	ID        primitive.ObjectID `json:"id,omitempty" bson:"_id,omitempty"`
	SessionID string             `json:"sessionId,omitempty" bson:"sessionId,omitempty"`
	Type      string             `json:"type" bson:"type" binding:"required,oneof=console network state error dom"`
	Timestamp int64              `json:"timestamp" bson:"timestamp"`
	Payload   interface{}        `json:"payload" bson:"payload"`
	CreatedAt time.Time          `json:"createdAt,omitempty" bson:"createdAt,omitempty"`
}

type ConsolePayload struct {
	Level   string        `json:"level" bson:"level"`
	Message string        `json:"message" bson:"message"`
	Args    []interface{} `json:"args,omitempty" bson:"args,omitempty"`
	Stack   string        `json:"stack,omitempty" bson:"stack,omitempty"`
}

type NetworkPayload struct {
	Method   string                 `json:"method" bson:"method"`
	URL      string                 `json:"url" bson:"url"`
	Status   int                    `json:"status" bson:"status"`
	Request  NetworkRequest         `json:"request" bson:"request"`
	Response NetworkResponse        `json:"response" bson:"response"`
	Timing   NetworkTiming          `json:"timing" bson:"timing"`
}

type NetworkRequest struct {
	Headers map[string]string `json:"headers" bson:"headers"`
	Body    string            `json:"body,omitempty" bson:"body,omitempty"`
}

type NetworkResponse struct {
	Headers map[string]string `json:"headers" bson:"headers"`
	Body    string            `json:"body,omitempty" bson:"body,omitempty"`
	Size    int               `json:"size" bson:"size"`
}

type NetworkTiming struct {
	Start    int64 `json:"start" bson:"start"`
	End      int64 `json:"end" bson:"end"`
	Duration int64 `json:"duration" bson:"duration"`
}

type StatePayload struct {
	Source  string      `json:"source" bson:"source"`
	Key     string      `json:"key,omitempty" bson:"key,omitempty"`
	Data    interface{} `json:"data" bson:"data"`
	Changed bool        `json:"changed,omitempty" bson:"changed,omitempty"`
}

type ErrorPayload struct {
	Message string `json:"message" bson:"message"`
	Stack   string `json:"stack" bson:"stack"`
	Type    string `json:"type" bson:"type"`
	Source  string `json:"source,omitempty" bson:"source,omitempty"`
	Line    int    `json:"line,omitempty" bson:"line,omitempty"`
	Column  int    `json:"column,omitempty" bson:"column,omitempty"`
}
