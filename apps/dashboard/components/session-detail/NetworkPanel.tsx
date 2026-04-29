"use client";

import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface NetworkEvent {
  type: string;
  timestamp?: number;
  payload?: {
    method?: string;
    url?: string;
    status?: number;
    statusText?: string;
    duration?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
    [key: string]: unknown;
  };
}

interface NetworkPanelProps {
  events: NetworkEvent[];
}

function formatTimestamp(ms?: number): string {
  if (ms == null || Number.isNaN(ms)) return "0ms";
  return `${Math.round(ms)}ms`;
}

function getStatusColor(status?: number): string {
  if (!status) return "text-muted-foreground";
  if (status >= 200 && status < 300) return "text-emerald-400";
  if (status >= 300 && status < 400) return "text-amber-400";
  if (status >= 400) return "text-destructive";
  return "text-muted-foreground";
}

function getStatusBadge(status?: number): "success" | "warning" | "destructive" | "outline" {
  if (!status) return "outline";
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "warning";
  if (status >= 400) return "destructive";
  return "outline";
}

export function NetworkPanel({ events }: NetworkPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const networkEvents = events.filter((e) => e.type === "network");

  if (networkEvents.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No network events captured.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="max-h-[500px] overflow-auto">
          <div className="divide-y divide-border">
            {networkEvents.map((event, i) => {
              const p = event.payload || {};
              const isSelected = selectedIndex === i;
              return (
                <div
                  key={i}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? "bg-secondary/50" : "hover:bg-secondary/30"
                  }`}
                >
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    onClick={() => setSelectedIndex(isSelected ? null : i)}
                  >
                    <Badge
                      variant={getStatusBadge(p.status)}
                      className="text-[10px] shrink-0 w-12 justify-center"
                    >
                      {p.method || "GET"}
                    </Badge>
                    <span
                      className={`text-sm font-medium shrink-0 w-10 text-right ${getStatusColor(p.status)}`}
                    >
                      {p.status || "—"}
                    </span>
                    <span className="text-sm text-foreground truncate flex-1 min-w-0 font-mono">
                      {p.url || "unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 w-16 text-right">
                      {p.duration != null ? `${p.duration}ms` : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 w-14 text-right">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50 bg-background/50">
                      <div className="grid grid-cols-2 gap-4 pt-3">
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Request
                          </h4>
                          <pre className="text-xs font-mono bg-secondary/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                            {JSON.stringify(p.requestBody ?? p.requestHeaders ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Response
                          </h4>
                          <pre className="text-xs font-mono bg-secondary/50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                            {JSON.stringify(p.responseBody ?? p.responseHeaders ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
