"use client";

import type { PlaylistItem } from "@primer/shared";
import { PlaylistItemCard } from "./playlist-item-card";

interface CheckChartProps {
  playlist: PlaylistItem[];
  stats: {
    total: number;
    completed: number;
    available: number;
    locked: number;
  };
  studentName: string | null;
  courseId: string;
}

export function CheckChart({ playlist, stats, studentName, courseId }: CheckChartProps) {
  const progressPercent =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {studentName ? `${studentName}'s` : "My"} Playlist
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {stats.available > 0
            ? `${stats.available} lessons ready to go`
            : stats.completed === stats.total
              ? "All lessons mastered!"
              : "Keep going — more lessons unlock as you master skills"}
        </p>
      </div>

      {/* Progress summary */}
      <div className="flex items-center gap-4">
        <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {stats.completed}/{stats.total} complete
        </span>
      </div>

      {/* Playlist items */}
      <div className="space-y-2">
        {playlist.map((item) => (
          <PlaylistItemCard key={item.id} item={item} courseId={courseId} />
        ))}
      </div>

      {playlist.length === 0 && (
        <div className="border border-border rounded-lg p-8 text-center text-muted-foreground">
          <p className="text-lg mb-2">No lessons available yet</p>
          <p className="text-sm">
            Enroll in a course to get your personalized playlist.
          </p>
        </div>
      )}
    </div>
  );
}
