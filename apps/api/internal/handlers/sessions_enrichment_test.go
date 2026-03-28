package handlers

import "testing"

func TestNormalizeTagValues(t *testing.T) {
	input := []string{"  Urgent ", "urgent", "", "triage", "Triage"}
	actual := normalizeTagValues(input)

	if len(actual) != 2 {
		t.Fatalf("expected 2 normalized tags, got %d: %#v", len(actual), actual)
	}
	if actual[0] != "urgent" || actual[1] != "triage" {
		t.Fatalf("unexpected normalized tags: %#v", actual)
	}
}

func TestNormalizeSessionIDs(t *testing.T) {
	input := []string{" s-1 ", "s-2", "s-1", ""}
	actual := normalizeSessionIDs(input)

	if len(actual) != 2 {
		t.Fatalf("expected 2 normalized session IDs, got %d: %#v", len(actual), actual)
	}
	if actual[0] != "s-1" || actual[1] != "s-2" {
		t.Fatalf("unexpected normalized session IDs: %#v", actual)
	}
}
