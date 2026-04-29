"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Copy, FileCode, Sparkles } from "lucide-react";

interface AiAnalysis {
  summary: string;
  rootCause: string;
  suggestedFiles: string[];
  actions: string[];
  confidence: number;
  provider: string;
  model: string;
  status: "completed" | "fallback";
  classification?: string;
  codeContextFiles?: Array<{ path: string; reason: string; score: number; lineHint?: string }>;
  crossFileTraces?: string[];
}

interface AiPanelProps {
  analysis: AiAnalysis | null;
}

export function AiPanel({ analysis }: AiPanelProps) {
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Sparkles className="w-10 h-10 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No AI analysis</h3>
        <p className="text-muted-foreground text-sm max-w-sm">
          This session has not been analyzed yet. AI analysis runs when captured or can be triggered from the extension.
        </p>
      </div>
    );
  }

  const isFallback = analysis.status === "fallback";
  const confidencePercent = Math.round(analysis.confidence * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {isFallback ? (
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        )}
        <Badge variant={isFallback ? "warning" : "success"} className="text-xs">
          {isFallback ? "Fallback analysis" : "AI analysis"} — {confidencePercent}% confidence
        </Badge>
        <span className="text-xs text-muted-foreground">
          {analysis.provider} / {analysis.model}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Summary</h4>
        <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Root Cause</h4>
        <p className="text-sm text-foreground leading-relaxed">{analysis.rootCause}</p>
      </div>

      {analysis.suggestedFiles.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Suggested Files</h4>
          <div className="space-y-2">
            {analysis.suggestedFiles.map((file) => (
              <div
                key={file}
                className="flex items-center gap-2 text-sm font-mono text-foreground bg-secondary/50 rounded px-3 py-2"
              >
                <FileCode className="w-4 h-4 text-primary shrink-0" />
                <span className="truncate">{file}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 ml-auto shrink-0"
                  onClick={() => navigator.clipboard.writeText(file)}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.actions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recommended Actions</h4>
          <ul className="space-y-2">
            {analysis.actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <span className="text-primary mt-0.5">{i + 1}.</span>
                <span className="leading-relaxed">{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.codeContextFiles && analysis.codeContextFiles.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Code Context</h4>
          <div className="space-y-2">
            {analysis.codeContextFiles.map((file) => (
              <div
                key={file.path}
                className="flex items-center justify-between text-sm font-mono bg-secondary/50 rounded px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{file.path}</span>
                  {file.lineHint && (
                    <span className="text-muted-foreground text-xs">:{file.lineHint}</span>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">score {file.score}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.crossFileTraces && analysis.crossFileTraces.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cross-File Traces</h4>
          <div className="space-y-1">
            {analysis.crossFileTraces.map((trace, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground">{trace}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
