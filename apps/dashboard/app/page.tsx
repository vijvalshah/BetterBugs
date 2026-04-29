"use client";

import { FilterBar } from "@/components/session-list/FilterBar";
import { SessionCard } from "@/components/session-list/SessionCard";
import { SessionSkeletonList } from "@/components/session-list/SessionSkeleton";
import { listSessions, type ApiSession } from "@/lib/api";
import { Bug, Inbox, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { limit?: number; tag?: string; url?: string } = { limit: 50 };
      if (activeTag) params.tag = activeTag;
      if (searchQuery) params.url = searchQuery;
      const data = await listSessions(params);
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTag]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session?")) return;
    try {
      const { deleteSession } = await import("@/lib/api");
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.sessionId !== id));
    } catch {
      alert("Failed to delete session");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bug className="w-6 h-6 text-primary" />
            Sessions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {sessions.length} capture{sessions.length !== 1 ? "s" : ""} found
          </p>
        </div>
      </div>

      <FilterBar
        onSearch={setSearchQuery}
        onFilterTag={setActiveTag}
        onRefresh={fetchSessions}
        activeTag={activeTag || undefined}
        isLoading={loading}
      />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <SessionSkeletonList />
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Inbox className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No sessions yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm mb-4">
            Capture your first bug session using the browser extension. Sessions will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <SessionCard key={session.sessionId} session={session} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
