"use client";

interface StreakDisplayProps {
  current: number;
  last7Days: boolean[];
}

export function StreakDisplay({ current, last7Days }: StreakDisplayProps) {
  return (
    <div className="flex items-center gap-3">
      {/* Flame + count */}
      <div className="flex items-center gap-1.5">
        <span className="text-lg" role="img" aria-label="streak">
          🔥
        </span>
        <span className="font-bold text-lg">{current}</span>
        <span className="text-sm text-muted-foreground">
          day{current !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Last 7 days */}
      <div className="flex items-center gap-1">
        {last7Days
          .slice()
          .reverse()
          .map((active, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                active
                  ? "bg-orange-400"
                  : "bg-border"
              }`}
              title={i === 6 ? "Today" : `${6 - i} days ago`}
            />
          ))}
      </div>
    </div>
  );
}
