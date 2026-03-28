package handlers

import (
    "testing"
    "time"

    "github.com/bugcatcher/api/internal/models"
)

func validPayload() models.SessionPayload {
    return models.SessionPayload{
        ProjectID: "project-a",
        URL:       "https://example.com/path",
        Timestamp: time.Now().UTC(),
        Environment: models.Environment{
            Browser:  "Chrome",
            OS:       "macOS",
            Language: "en-US",
            Viewport: models.Viewport{
                Width:  1280,
                Height: 720,
            },
        },
        Events: []models.Event{
            {
                Type:      "console",
                Timestamp: 1,
                Payload: map[string]any{
                    "message": "ok",
                },
            },
        },
        Media: models.Media{HasReplay: false},
    }
}

func TestValidateSessionPayload_Valid(t *testing.T) {
    payload := validPayload()
    issues := validateSessionPayload(payload)
    if len(issues) != 0 {
        t.Fatalf("expected no issues, got %d: %#v", len(issues), issues)
    }
}

func TestValidateSessionPayload_MissingAndInvalidFields(t *testing.T) {
    payload := validPayload()
    payload.ProjectID = ""
    payload.URL = "not a url"
    payload.Environment.Browser = ""
    payload.Environment.Viewport.Width = 0

    issues := validateSessionPayload(payload)
    if len(issues) < 4 {
        t.Fatalf("expected at least 4 issues, got %d: %#v", len(issues), issues)
    }
}

func TestValidateSessionPayload_EventValidation(t *testing.T) {
    payload := validPayload()
    payload.Events = []models.Event{
        {
            Type:      "unknown",
            Timestamp: 0,
            Payload:   nil,
        },
    }

    issues := validateSessionPayload(payload)
    if len(issues) != 3 {
        t.Fatalf("expected 3 event issues, got %d: %#v", len(issues), issues)
    }
}

func TestValidateSessionPayload_ErrorObjectValidation(t *testing.T) {
    payload := validPayload()
    payload.Error = &models.ErrorInfo{Type: "", Message: ""}

    issues := validateSessionPayload(payload)
    if len(issues) < 2 {
        t.Fatalf("expected error object issues, got %d: %#v", len(issues), issues)
    }
}
