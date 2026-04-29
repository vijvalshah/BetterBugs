package handlers

import (
	"context"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/database"
	"github.com/bugcatcher/api/internal/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
)

type ShareHandler struct {
	db *database.Database
}

type shareReportView struct {
	SessionID       string
	Title           string
	URL             string
	CreatedAt       string
	Timestamp       string
	DurationSeconds string
	Environment     string
	Browser         string
	OS              string
	ErrorType       string
	ErrorMessage    string
	HasError        bool
	Stats           models.Stats
	TriageSummary   models.TriageSummary
	Tags            []string
	CommentCount    int
	TopEndpoints    []models.NetworkEndpointTriage
	StatusHistogram []string
	GeneratedAt     string
}

func NewShareHandler(db *database.Database) *ShareHandler {
	return &ShareHandler{db: db}
}

func (h *ShareHandler) ShareView(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Param("id"))
	if sessionID == "" {
		c.String(http.StatusBadRequest, "share link is missing a session id")
		return
	}

	var session models.Session
	err := h.db.Sessions.FindOne(context.Background(), bson.M{"sessionId": sessionID}).Decode(&session)
	if err != nil {
		c.String(http.StatusNotFound, "report not found")
		return
	}

	view := buildShareReportView(session)

	c.Header("Content-Type", "text/html; charset=utf-8")
	tmpl := template.Must(template.New("share").Parse(shareReportTemplate))
	_ = tmpl.Execute(c.Writer, view)
}

func buildShareReportView(session models.Session) shareReportView {
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = "Untitled report"
	}

	createdAt := session.CreatedAt
	timestamp := session.Timestamp

	durationSeconds := ""
	if session.Duration > 0 {
		durationSeconds = formatDurationSeconds(session.Duration)
	}

	errorType := ""
	errorMessage := ""
	hasError := false
	if session.Error != nil {
		errorType = strings.TrimSpace(session.Error.Type)
		errorMessage = strings.TrimSpace(session.Error.Message)
		hasError = errorType != "" || errorMessage != ""
	}

	env := session.Environment
	environment := strings.TrimSpace(strings.Join([]string{
		env.Browser,
		env.BrowserVersion,
		env.OS,
		env.OSVersion,
	}, " "))

	statusHistogram := make([]string, 0)
	if session.TriageSummary.StatusHistogram != nil {
		for code, count := range session.TriageSummary.StatusHistogram {
			statusHistogram = append(statusHistogram, code+": "+formatInt(count))
		}
	}

	return shareReportView{
		SessionID:       session.SessionID,
		Title:           title,
		URL:             session.URL,
		CreatedAt:       createdAt.UTC().Format(time.RFC3339),
		Timestamp:       timestamp.UTC().Format(time.RFC3339),
		DurationSeconds: durationSeconds,
		Environment:     environment,
		Browser:         strings.TrimSpace(env.Browser + " " + env.BrowserVersion),
		OS:              strings.TrimSpace(env.OS + " " + env.OSVersion),
		ErrorType:       errorType,
		ErrorMessage:    errorMessage,
		HasError:        hasError,
		Stats:           session.Stats,
		TriageSummary:   session.TriageSummary,
		Tags:            session.Tags,
		CommentCount:    len(session.Comments),
		TopEndpoints:    session.TriageSummary.TopFailingEndpoints,
		StatusHistogram: statusHistogram,
		GeneratedAt:     time.Now().UTC().Format(time.RFC3339),
	}
}

func formatDurationSeconds(durationMs int64) string {
	seconds := durationMs / 1000
	if seconds <= 0 {
		return ""
	}
	return formatInt(int(seconds)) + "s"
}

func formatInt(value int) string {
	return strconv.Itoa(value)
}

const shareReportTemplate = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BetterBugs Share Report</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, sans-serif; margin: 32px; color: #1b1b1b; background: #fafafa; }
    .container { max-width: 920px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 28px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin-top: 24px; border-bottom: 1px solid #e6e6e6; padding-bottom: 6px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
    .pill { display: inline-block; background: #f2f4f7; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin-right: 8px; }
    .section { margin-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .card { background: #f8f9fb; border: 1px solid #e6e9ef; border-radius: 6px; padding: 12px; }
    .value { font-weight: 600; }
    ul { margin: 8px 0 0 18px; }
    .muted { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="meta">Generated {{.GeneratedAt}}</div>
    <h1>{{.Title}}</h1>
    <div class="meta">Session {{.SessionID}}</div>

    <div class="section">
      <span class="pill">URL: {{.URL}}</span>
      <span class="pill">Captured: {{.Timestamp}}</span>
      <span class="pill">Stored: {{.CreatedAt}}</span>
      {{if .DurationSeconds}}<span class="pill">Duration: {{.DurationSeconds}}</span>{{end}}
    </div>

    <h2>Overview</h2>
    <div class="grid">
      <div class="card">
        <div class="muted">Error</div>
        <div class="value">{{if .HasError}}{{.ErrorType}}{{else}}None{{end}}</div>
        {{if .HasError}}<div class="muted">{{.ErrorMessage}}</div>{{end}}
      </div>
      <div class="card">
        <div class="muted">Browser</div>
        <div class="value">{{.Browser}}</div>
      </div>
      <div class="card">
        <div class="muted">OS</div>
        <div class="value">{{.OS}}</div>
      </div>
      <div class="card">
        <div class="muted">Signals</div>
        <div class="value">Console {{.Stats.ConsoleCount}} | Network {{.Stats.NetworkCount}} | State {{.Stats.StateSnapshots}}</div>
      </div>
    </div>

    <h2>Signal Summary</h2>
    <div class="grid">
      <div class="card">
        <div class="muted">Errors</div>
        <div class="value">{{.TriageSummary.ErrorCount}}</div>
        {{if .TriageSummary.TopErrorMessage}}<div class="muted">{{.TriageSummary.TopErrorMessage}}</div>{{end}}
      </div>
      <div class="card">
        <div class="muted">Failed Requests</div>
        <div class="value">{{.TriageSummary.FailedRequestCount}}</div>
      </div>
      <div class="card">
        <div class="muted">P95 Network (ms)</div>
        <div class="value">{{.TriageSummary.P95NetworkDurationMs}}</div>
      </div>
      <div class="card">
        <div class="muted">State Snapshots</div>
        <div class="value">{{.TriageSummary.StateSnapshotCount}}</div>
      </div>
    </div>

    {{if .TopEndpoints}}
    <h2>Top Failing Endpoints</h2>
    <ul>
      {{range .TopEndpoints}}
      <li>{{.Method}} {{.Path}} ({{.Count}})</li>
      {{end}}
    </ul>
    {{end}}

    {{if .StatusHistogram}}
    <h2>Status Histogram</h2>
    <ul>
      {{range .StatusHistogram}}
      <li>{{.}}</li>
      {{end}}
    </ul>
    {{end}}

    <h2>Tags & Notes</h2>
    <div class="grid">
      <div class="card">
        <div class="muted">Tags</div>
        <div class="value">{{if .Tags}}{{range .Tags}}{{.}} {{end}}{{else}}None{{end}}</div>
      </div>
      <div class="card">
        <div class="muted">Comments</div>
        <div class="value">{{.CommentCount}}</div>
      </div>
    </div>

    <p class="muted" style="margin-top: 24px;">This share report omits videos and raw payloads for privacy. Use the authenticated UI for full replay.</p>
  </div>
</body>
</html>`
