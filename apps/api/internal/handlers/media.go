package handlers

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/bugcatcher/api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type MediaHandler struct {
	cfg *config.Config
}

type ScreenshotRequest struct {
	DataUrl    string `json:"dataUrl"`
	CapturedAt string `json:"capturedAt"`
	TabUrl     string `json:"tabUrl"`
	TabTitle   string `json:"tabTitle"`
	SessionID  string `json:"sessionId"`
}

type VideoRequest struct {
	DataUrl    string `json:"dataUrl"`
	CapturedAt string `json:"capturedAt"`
	TabUrl     string `json:"tabUrl"`
	TabTitle   string `json:"tabTitle"`
}

func NewMediaHandler(cfg *config.Config) *MediaHandler {
	return &MediaHandler{cfg: cfg}
}

func (h *MediaHandler) StoreScreenshot(c *gin.Context) {
	var payload ScreenshotRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code": "INVALID_PAYLOAD",
		})
		return
	}

	if strings.TrimSpace(payload.DataUrl) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing screenshot dataUrl",
			"code": "MISSING_DATA_URL",
		})
		return
	}

	prefix, encoded, found := strings.Cut(payload.DataUrl, ",")
	if !found || !strings.HasPrefix(prefix, "data:image/") || !strings.Contains(prefix, ";base64") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Unsupported screenshot format",
			"code": "INVALID_IMAGE_FORMAT",
		})
		return
	}

	if !strings.HasPrefix(prefix, "data:image/png") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Only PNG screenshots are supported",
			"code": "INVALID_IMAGE_FORMAT",
		})
		return
	}

	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to decode screenshot",
			"code": "DECODE_FAILED",
		})
		return
	}

	projectId, _ := c.Get("projectId")
	projectFolder := "unknown-project"
	if value, ok := projectId.(string); ok && strings.TrimSpace(value) != "" {
		projectFolder = value
	}

	baseDir := h.cfg.MediaStorageDir
	screenshotsDir := filepath.Join(baseDir, "screenshots", projectFolder)
	if err := os.MkdirAll(screenshotsDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to prepare screenshot storage",
			"code": "STORAGE_INIT_FAILED",
		})
		return
	}

	filename := fmt.Sprintf("%s-%s.png", time.Now().UTC().Format("20060102-150405"), uuid.NewString())
	fullPath := filepath.Join(screenshotsDir, filename)
	if err := os.WriteFile(fullPath, decoded, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to store screenshot",
			"code": "STORAGE_WRITE_FAILED",
		})
		return
	}

	// Also save to session_images folder if sessionId is provided
	if strings.TrimSpace(payload.SessionID) != "" {
		sessionImagesDir := filepath.Join("session_images", payload.SessionID)
		if err := os.MkdirAll(sessionImagesDir, 0o755); err == nil {
			sessionScreenshotPath := filepath.Join(sessionImagesDir, "screenshot.png")
			if err := os.WriteFile(sessionScreenshotPath, decoded, 0o644); err == nil {
				// Successfully saved to session_images
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":        true,
		"path":      fullPath,
		"size":      len(decoded),
		"capturedAt": payload.CapturedAt,
	})
}

func (h *MediaHandler) StoreVideo(c *gin.Context) {
	var payload VideoRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request payload",
			"code": "INVALID_PAYLOAD",
		})
		return
	}

	if strings.TrimSpace(payload.DataUrl) == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Missing video dataUrl",
			"code": "MISSING_DATA_URL",
		})
		return
	}

	prefix, encoded, found := strings.Cut(payload.DataUrl, ",")
	if !found || !strings.HasPrefix(prefix, "data:video/") || !strings.Contains(prefix, ";base64") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Unsupported video format",
			"code": "INVALID_VIDEO_FORMAT",
		})
		return
	}

	if !strings.HasPrefix(prefix, "data:video/webm") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Only WebM videos are supported",
			"code": "INVALID_VIDEO_FORMAT",
		})
		return
	}

	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Failed to decode video",
			"code": "DECODE_FAILED",
		})
		return
	}

	projectId, _ := c.Get("projectId")
	projectFolder := "unknown-project"
	if value, ok := projectId.(string); ok && strings.TrimSpace(value) != "" {
		projectFolder = value
	}

	baseDir := h.cfg.MediaStorageDir
	videosDir := filepath.Join(baseDir, "videos", projectFolder)
	if err := os.MkdirAll(videosDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to prepare video storage",
			"code": "STORAGE_INIT_FAILED",
		})
		return
	}

	filename := fmt.Sprintf("%s-%s.webm", time.Now().UTC().Format("20060102-150405"), uuid.NewString())
	fullPath := filepath.Join(videosDir, filename)
	if err := os.WriteFile(fullPath, decoded, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to store video",
			"code": "STORAGE_WRITE_FAILED",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":        true,
		"path":      fullPath,
		"size":      len(decoded),
		"capturedAt": payload.CapturedAt,
	})
}