package handlers

import (
    "fmt"
    "net/url"
    "strings"

    "github.com/bugcatcher/api/internal/models"
)

type ValidationIssue struct {
    Field string `json:"field"`
    Issue string `json:"issue"`
}

var allowedEventTypes = map[string]struct{}{
    "console": {},
    "network": {},
    "state":   {},
    "error":   {},
    "dom":     {},
}

func validateSessionPayload(payload models.SessionPayload) []ValidationIssue {
    issues := make([]ValidationIssue, 0)

    if strings.TrimSpace(payload.ProjectID) == "" {
        issues = append(issues, ValidationIssue{Field: "projectId", Issue: "projectId is required"})
    }

    if strings.TrimSpace(payload.URL) == "" {
        issues = append(issues, ValidationIssue{Field: "url", Issue: "url is required"})
    } else if _, err := url.ParseRequestURI(payload.URL); err != nil {
        issues = append(issues, ValidationIssue{Field: "url", Issue: "url must be a valid absolute URL"})
    }

    if payload.Timestamp.IsZero() {
        issues = append(issues, ValidationIssue{Field: "timestamp", Issue: "timestamp is required"})
    }

    if strings.TrimSpace(payload.Environment.Browser) == "" {
        issues = append(issues, ValidationIssue{Field: "environment.browser", Issue: "browser is required"})
    }
    if strings.TrimSpace(payload.Environment.OS) == "" {
        issues = append(issues, ValidationIssue{Field: "environment.os", Issue: "os is required"})
    }
    if strings.TrimSpace(payload.Environment.Language) == "" {
        issues = append(issues, ValidationIssue{Field: "environment.language", Issue: "language is required"})
    }
    if payload.Environment.Viewport.Width <= 0 {
        issues = append(issues, ValidationIssue{Field: "environment.viewport.width", Issue: "viewport width must be > 0"})
    }
    if payload.Environment.Viewport.Height <= 0 {
        issues = append(issues, ValidationIssue{Field: "environment.viewport.height", Issue: "viewport height must be > 0"})
    }

    if payload.Error != nil {
        if strings.TrimSpace(payload.Error.Type) == "" {
            issues = append(issues, ValidationIssue{Field: "error.type", Issue: "error type is required when error object is provided"})
        }
        if strings.TrimSpace(payload.Error.Message) == "" {
            issues = append(issues, ValidationIssue{Field: "error.message", Issue: "error message is required when error object is provided"})
        }
    }

    for index, event := range payload.Events {
        if _, ok := allowedEventTypes[event.Type]; !ok {
            issues = append(issues, ValidationIssue{
                Field: fmt.Sprintf("events[%d].type", index),
                Issue: "event type must be one of: console, network, state, error, dom",
            })
        }

        if event.Timestamp <= 0 {
            issues = append(issues, ValidationIssue{
                Field: fmt.Sprintf("events[%d].timestamp", index),
                Issue: "event timestamp must be > 0",
            })
        }

        if event.Payload == nil {
            issues = append(issues, ValidationIssue{
                Field: fmt.Sprintf("events[%d].payload", index),
                Issue: "event payload is required",
            })
        }
    }

    return issues
}
