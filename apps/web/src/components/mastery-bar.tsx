"use client";

interface MasteryBarProps {
  name: string;
  pMastery: number;
  totalAttempts: number;
  correctCount: number;
  masteredAt: string | null;
  threshold: number;
}

export function MasteryBar({
  name,
  pMastery,
  totalAttempts,
  correctCount,
  masteredAt,
  threshold,
}: MasteryBarProps) {
  const percentage = Math.round(pMastery * 100);
  const isMastered = pMastery >= threshold;
  const accuracy =
    totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-1">
        <div className="flex items-center gap-2">
          {isMastered && <span className="text-green-500">✓</span>}
          <span className="font-medium text-sm">{name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{totalAttempts} attempts</span>
          <span>{accuracy}% accuracy</span>
          <span className="font-medium text-foreground">{percentage}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 bg-border rounded-full overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
            isMastered
              ? "bg-green-500"
              : pMastery > 0.5
                ? "bg-blue-500"
                : pMastery > 0.25
                  ? "bg-amber-500"
                  : "bg-red-400"
          }`}
          style={{ width: `${percentage}%` }}
        />
        {/* Mastery threshold marker */}
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/30"
          style={{ left: `${Math.round(threshold * 100)}%` }}
          title={`Mastery threshold: ${Math.round(threshold * 100)}%`}
        />
      </div>

      {masteredAt && (
        <div className="text-xs text-green-600 mt-1.5">
          Mastered {new Date(masteredAt).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
