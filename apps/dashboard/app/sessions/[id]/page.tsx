"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiPanel } from "@/components/session-detail/AiPanel";
import { ConsolePanel } from "@/components/session-detail/ConsolePanel";
import { NetworkPanel } from "@/components/session-detail/NetworkPanel";
import { getSession, type ApiSession } from "@/lib/api";
import { AlertTriangle, ArrowLeft, Bug, Copy, Globe, Monitor, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function formatDate(value?: string): string {
  if (!value) return "unknown";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"console" | "network" | "state" | "ai">("console");

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setLoading(true);
    getSession(sessionId)
      .then((s) => {
        if (cancelled) return;
        if (!s) {
          setError("Session not found");
        } else {
          setSession(s);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">{error || "Session not found"}</h3>
        <Link href="/">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to sessions
          </Button>
        </Link>
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace(/:\d+$/, ":3001")}/share/${session.sessionId}`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {session.error ? (
                  <Bug className="w-5 h-5 text-destructive shrink-0" />
                ) : (
                  <Monitor className="w-5 h-5 text-muted-foreground shrink-0" />
                )}
                <h1 className="text-xl font-bold truncate">
                  {session.title || session.url || "Untitled session"}
                </h1>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                <Globe className="w-3.5 h-3.5" />
                <span className="truncate">{session.url}</span>
                <span className="text-border">|</span>
                <span>{formatDate(session.timestamp || session.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {shareUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy share link
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Monitor className="w-3 h-3" />
              {session.environment?.browser || "Unknown"} {session.environment?.browserVersion || ""}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {session.environment?.os || "Unknown"} {session.environment?.osVersion || ""}
            </Badge>
            {session.tags?.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                <Tag className="w-3 h-3" />
                {tag}
              </Badge>
            ))}
            {session.error && (
              <Badge variant="destructive">{session.error.type}</Badge>
            )}
          </div>

          {session.error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <div className="font-mono text-sm text-destructive">
                <strong>{session.error.type}:</strong> {session.error.message}
              </div>
              {session.error.stack && (
                <pre className="mt-2 text-xs text-destructive/80 overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                  {session.error.stack}
                </pre>
              )}
            </div>
          )}

          {session.aiAnalysis && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="success" className="text-[10px]">
                  AI Analysis ({Math.round(session.aiAnalysis.confidence * 100)}% confidence)
                </Badge>
                <span className="text-xs text-muted-foreground">{session.aiAnalysis.provider} / {session.aiAnalysis.model}</span>
              </div>
              <p className="text-sm text-foreground mb-2">{session.aiAnalysis.summary}</p>
              <p className="text-sm text-muted-foreground">
                <strong>Root cause:</strong> {session.aiAnalysis.rootCause}
              </p>
              {session.aiAnalysis.suggestedFiles?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.aiAnalysis.suggestedFiles.map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px] font-mono">{f}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 border-b border-border">
            {(["console", "network", "state", "ai"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors relative ${
                  activeTab === tab ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "ai" && !session.aiAnalysis ? `${tab} (none)` : tab}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[300px]">
            {activeTab === "console" && <ConsolePanel events={session.events || []} />}
            {activeTab === "network" && <NetworkPanel events={session.events || []} />}
            {activeTab === "state" && (
              <div className="text-center py-12 text-muted-foreground text-sm">State snapshots will be displayed here.</div>
            )}
            {activeTab === "ai" && <AiPanel analysis={session.aiAnalysis || null} />}
          </div>
        </div>

        <div className="w-full lg:w-[360px] shrink-0 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Stats</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-lg font-bold">{session.stats?.consoleCount ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Console</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-lg font-bold">{session.stats?.networkCount ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Network</div>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3">
                <div className="text-lg font-bold">{session.stats?.stateSnapshots ?? 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">State</div>
              </div>
            </div>
          </div>

          {session.triageSummary && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">Triage</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Errors</span>
                  <span className="font-medium">{session.triageSummary.errorCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed requests</span>
                  <span className="font-medium">{session.triageSummary.failedRequestCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">P95 latency</span>
                  <span className="font-medium">{session.triageSummary.p95NetworkDurationMs}ms</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Session ID</h3>
            <code className="block text-xs font-mono bg-secondary/50 rounded px-2 py-1.5 break-all">
              {session.sessionId}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
