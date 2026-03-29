package handlers

import "testing"

func TestNegotiateVersion(t *testing.T) {
	handler := &PluginGatewayHandler{supportedVersions: []string{"1.0", "0.9"}}

	t.Run("defaults to latest when empty", func(t *testing.T) {
		version, err := handler.negotiateVersion("")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if version != "1.0" {
			t.Fatalf("expected 1.0, got %s", version)
		}
	})

	t.Run("accepts supported version", func(t *testing.T) {
		version, err := handler.negotiateVersion("0.9")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if version != "0.9" {
			t.Fatalf("expected 0.9, got %s", version)
		}
	})

	t.Run("rejects unsupported version", func(t *testing.T) {
		if _, err := handler.negotiateVersion("2.0"); err == nil {
			t.Fatalf("expected error for unsupported version")
		}
	})
}

func TestBuildManifest(t *testing.T) {
	handler := &PluginGatewayHandler{supportedVersions: []string{"1.0"}}
	manifest := handler.buildManifest("1.0")

	if manifest.ContractVersion != "1.0" {
		t.Fatalf("contractVersion not set")
	}
	if len(manifest.Capabilities) == 0 {
		t.Fatalf("capabilities should not be empty")
	}
	if manifest.Auth.Header != "X-Project-Key" {
		t.Fatalf("expected auth header X-Project-Key")
	}
	if _, ok := manifest.Endpoints["list"]; !ok {
		t.Fatalf("manifest endpoints missing list")
	}
	if len(manifest.SupportedVersions) == 0 {
		t.Fatalf("supportedVersions should not be empty")
	}
}
