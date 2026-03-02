"use client";

import Link from "next/link";
import type { PlaylistItem } from "@primer/shared";

interface PlaylistItemCardProps {
  item: PlaylistItem;
  courseId: string;
}

export function PlaylistItemCard({ item, courseId }: PlaylistItemCardProps) {
  const statusConfig = {
    completed: {
      border: "border-green-500/30",
      bg: "bg-green-500/5",
      icon: "text-green-500",
      iconChar: "\u2713",
      label: "Mastered",
      labelColor: "text-green-600 dark:text-green-400",
      clickable: true,
    },
    in_progress: {
      border: "border-primary/30",
      bg: "bg-primary/5",
      icon: "text-primary",
      iconChar: "\u25B6",
      label: "In Progress",
      labelColor: "text-primary",
      clickable: true,
    },
    available: {
      border: "border-border",
      bg: "bg-background",
      icon: "text-muted-foreground",
      iconChar: "\u25CB",
      label: "Ready",
      labelColor: "text-muted-foreground",
      clickable: true,
    },
    locked: {
      border: "border-border/50",
      bg: "bg-background opacity-60",
      icon: "text-muted-foreground/50",
      iconChar: "\uD83D\uDD12",
      label: "Locked",
      labelColor: "text-muted-foreground/60",
      clickable: false,
    },
  };

  const config = statusConfig[item.status];

  // Build the lesson URL — lessons are at /courses/[lessonId] based on existing routing
  const content = (
    <div
      className={`flex items-center gap-4 border ${config.border} ${config.bg} rounded-lg px-4 py-4 min-h-[56px] transition-colors ${
        config.clickable
          ? "hover:border-primary/50 cursor-pointer"
          : "cursor-not-allowed"
      }`}
    >
      {/* Status icon */}
      <div className={`text-xl flex-shrink-0 w-8 text-center ${config.icon}`}>
        {config.iconChar}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{item.title}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs ${config.labelColor}`}>
            {config.label}
          </span>
          {item.status === "in_progress" && (
            <div className="flex-1 max-w-[100px] h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${Math.round(item.masteryRequired * 100)}%`,
                }}
              />
            </div>
          )}
          {item.estimatedMinutes > 0 && item.status !== "completed" && (
            <span className="text-xs text-muted-foreground">
              ~{item.estimatedMinutes} min
            </span>
          )}
        </div>
      </div>

      {/* Arrow for clickable items */}
      {config.clickable && (
        <div className="text-muted-foreground flex-shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 3l5 5-5 5" />
          </svg>
        </div>
      )}
    </div>
  );

  if (config.clickable) {
    return (
      <Link href={`/courses/${courseId}/${item.id}`} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
