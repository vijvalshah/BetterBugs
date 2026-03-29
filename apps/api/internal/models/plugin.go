package models

// PluginManifest describes the versioned plugin contract exposed by the gateway.
type PluginManifest struct {
	ContractVersion   string            `json:"contractVersion"`
	SupportedVersions []string          `json:"supportedVersions"`
	Capabilities      []string          `json:"capabilities"`
	Endpoints         map[string]string `json:"endpoints"`
	Auth              PluginAuth        `json:"auth"`
	RateLimits        PluginRateLimits  `json:"rateLimits"`
	Telemetry         PluginTelemetry   `json:"telemetry"`
	ErrorCodes        []string          `json:"errorCodes"`
	CompatibilityNote string            `json:"compatibilityNote,omitempty"`
}

// PluginAuth documents how callers authenticate.
type PluginAuth struct {
	Type        string `json:"type"`
	Header      string `json:"header"`
	Description string `json:"description,omitempty"`
}

// PluginRateLimits reports throttling expectations.
type PluginRateLimits struct {
	RequestsPerWindow int    `json:"requestsPerWindow"`
	WindowSeconds     int    `json:"windowSeconds"`
	BurstAllowance    int    `json:"burstAllowance"`
	Notes             string `json:"notes,omitempty"`
}

// PluginTelemetry describes observability hooks returned to clients.
type PluginTelemetry struct {
	RequestIDHeader string   `json:"requestIdHeader"`
	Metrics         []string `json:"metrics"`
	Logs            []string `json:"logs"`
}

// PluginGatewayError documents the canonical error payload for gateway responses.
type PluginGatewayError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}
