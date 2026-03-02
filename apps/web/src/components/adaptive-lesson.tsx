"use client";

import { useState, useEffect, useCallback } from "react";
import { ProblemViewer } from "./problem-viewer";
import { MasteryBar } from "./mastery-bar";
import type { ProblemDefinition } from "@primer/shared/src/content-schema";

interface AdaptiveLessonProps {
  lessonId: string;
  /** Fallback: all problems in order (for unauthenticated users) */
  staticProblems: Array<{ dbId: string; problem: ProblemDefinition }>;
}

interface NextProblemResponse {
  lessonComplete: boolean;
  blocked?: boolean;
  message?: string;
  problem?: {
    id: string;
    title: string;
    difficulty: number;
    content: ProblemDefinition;
  };
  targetKc?: {
    id: string;
    pMastery: number;
    totalAttempts: number;
    correctCount: number;
  };
  progress?: {
    totalKCs: number;
    masteredKCs: number;
    readyKCs: number;
  };
}

type Mode = "adaptive" | "static";

export function AdaptiveLesson({
  lessonId,
  staticProblems,
}: AdaptiveLessonProps) {
  const [mode, setMode] = useState<Mode>("static");
  const [loading, setLoading] = useState(true);
  const [currentProblem, setCurrentProblem] = useState<{
    dbId: string;
    problem: ProblemDefinition;
  } | null>(null);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [progress, setProgress] = useState<{
    totalKCs: number;
    masteredKCs: number;
    readyKCs: number;
  } | null>(null);
  const [targetKc, setTargetKc] = useState<{
    id: string;
    pMastery: number;
    totalAttempts: number;
    correctCount: number;
  } | null>(null);
  const [problemCount, setProblemCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchNextProblem = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/next-problem/${lessonId}`);
      if (res.status === 401) {
        // Not logged in — fall back to static mode
        setMode("static");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch next problem: ${res.status}`);
      }

      const data: NextProblemResponse = await res.json();

      if (data.lessonComplete) {
        setLessonComplete(true);
        setProgress(data.progress ?? null);
        setLoading(false);
        return;
      }

      if (data.blocked) {
        // Prerequisites not met — show a message
        setError(data.message ?? "Prerequisites not yet met.");
        setLoading(false);
        return;
      }

      if (data.problem) {
        setMode("adaptive");
        setCurrentProblem({
          dbId: data.problem.id,
          problem: {
            ...data.problem.content,
            id: data.problem.id,
            title: data.problem.title,
            difficulty: data.problem.difficulty,
          },
        });
        setTargetKc(data.targetKc ?? null);
        setProgress(data.progress ?? null);
      }

      setLoading(false);
    } catch {
      // On any error, fall back to static mode
      setMode("static");
      setLoading(false);
    }
  }, [lessonId]);

  // Fetch the first adaptive problem on mount
  useEffect(() => {
    fetchNextProblem();
  }, [fetchNextProblem]);

  const handleProblemComplete = useCallback(() => {
    setProblemCount((c) => c + 1);
    // Small delay before fetching next
    setTimeout(() => fetchNextProblem(), 800);
  }, [fetchNextProblem]);

  // Static mode — show all problems in sequence (for unauthenticated users)
  if (mode === "static") {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold">
          Practice ({staticProblems.length} problems)
        </h2>
        {staticProblems.map((sp, i) => (
          <div key={sp.dbId}>
            <div className="text-sm text-muted-foreground mb-2">
              Problem {i + 1} of {staticProblems.length}
            </div>
            <ProblemViewer problemId={sp.dbId} problem={sp.problem} />
          </div>
        ))}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="text-muted-foreground">Loading next problem...</div>
      </div>
    );
  }

  // Lesson complete
  if (lessonComplete) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-8 text-center">
          <div className="text-4xl mb-3 animate-pop">🎉</div>
          <h3 className="text-xl font-semibold mb-2">Lesson Mastered!</h3>
          <p className="text-muted-foreground">
            You&apos;ve mastered all knowledge components in this lesson.
          </p>
          {progress && (
            <p className="text-sm text-muted-foreground mt-2">
              {progress.masteredKCs}/{progress.totalKCs} skills mastered ·{" "}
              {problemCount} problems completed this session
            </p>
          )}
          <a
            href="/learn"
            className="inline-block mt-4 px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Back to My Playlist
          </a>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-6 text-center">
        <p className="text-amber-700 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  // Adaptive mode — show one problem at a time
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      {progress && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {progress.masteredKCs}/{progress.totalKCs} skills mastered
          </span>
          <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(
                  (progress.masteredKCs / progress.totalKCs) * 100
                )}%`,
              }}
            />
          </div>
          {problemCount > 0 && (
            <span>{problemCount} solved</span>
          )}
        </div>
      )}

      {/* Target KC indicator */}
      {targetKc && (
        <MasteryBar
          name={`Current focus`}
          pMastery={targetKc.pMastery}
          totalAttempts={targetKc.totalAttempts}
          correctCount={targetKc.correctCount}
          masteredAt={null}
          threshold={0.95}
        />
      )}

      {/* Current problem */}
      {currentProblem && (
        <ProblemViewer
          key={currentProblem.dbId}
          problemId={currentProblem.dbId}
          problem={currentProblem.problem}
          onComplete={handleProblemComplete}
        />
      )}
    </div>
  );
}
