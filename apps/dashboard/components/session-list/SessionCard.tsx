"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiSession } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Bug, Clock, Globe, MessageSquare, Monitor, Tag, Trash2 } from "lucide-react";
import Link from "next/link";

interface SessionCardProps {
  session: ApiSession;
  onDelete?: (id: string) => void;
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
  const hasError = !!session.error;
  const timestamp = new Date(session.timestamp || session.createdAt);
  const relativeTime = formatDistanceToNow(timestamp, { addSuffix: true });

  return (
    <Card className="overflow-hidden border-border/60 hover:border-border transition-colors group">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {hasError ? (
                <Bug className="w-4 h-4 text-destructive shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate text-foreground">
                {session.title || session.url || "Untitled session"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="w-3 h-3 shrink-0" />
              <span className="truncate">{session.url}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {hasError && (
              <Badge variant="destructive" className="text-[10px]">
                Error
              </Badge>
            )}
            {session.aiAnalysis && (
              <Badge variant="success" className="text-[10px]">
                AI Analyzed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Monitor className="w-3 h-3" />
            {session.environment?.browser || "Unknown"}
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Clock className="w-3 h-3" />
            {relativeTime}
          </Badge>
          {session.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] gap-1">
              <Tag className="w-3 h-3" />
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {session.stats?.consoleCount ?? 0} console
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {session.stats?.networkCount ?? 0} network
            </span>
            <span className="flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              {session.stats?.stateSnapshots ?? 0} state
            </span>
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link href={`/sessions/${session.sessionId}`}>
              <Button size="sm" variant="ghost">
                View
              </Button>
            </Link>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(session.sessionId)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
