"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bug, RefreshCw, Search, Tag } from "lucide-react";
import { useState } from "react";

interface FilterBarProps {
  onSearch: (query: string) => void;
  onFilterTag: (tag: string) => void;
  onRefresh: () => void;
  activeTag?: string;
  isLoading: boolean;
}

export function FilterBar({ onSearch, onFilterTag, onRefresh, activeTag, isLoading }: FilterBarProps) {
  const [searchValue, setSearchValue] = useState("");
  const [tagValue, setTagValue] = useState("");

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
      <div className="relative flex-1 w-full sm:w-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by URL, error message..."
          className="w-full sm:w-[320px] pl-9 pr-4 py-2 text-sm bg-secondary/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch(searchValue);
          }}
        />
      </div>

      <div className="relative flex-1 w-full sm:w-auto">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter by tag..."
          className="w-full sm:w-[200px] pl-9 pr-4 py-2 text-sm bg-secondary/50 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={tagValue}
          onChange={(e) => setTagValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onFilterTag(tagValue);
          }}
        />
      </div>

      {activeTag && (
        <Badge variant="secondary" className="gap-1">
          <Tag className="w-3 h-3" />
          {activeTag}
          <button
            className="ml-1 hover:text-foreground"
            onClick={() => {
              setTagValue("");
              onFilterTag("");
            }}
          >
            ×
          </button>
        </Badge>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchValue("");
            setTagValue("");
            onSearch("");
            onFilterTag("");
          }}
        >
          <Bug className="w-4 h-4 mr-1" />
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
}
