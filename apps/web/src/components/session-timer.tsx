"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Session timer that tracks active learning time.
 * Pauses on tab hidden (Page Visibility API) and after 30s idle.
 * Resumes on interaction. No time pressure — just informational.
 */
export function SessionTimer() {
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const lastInteraction = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetIdle = useCallback(() => {
    lastInteraction.current = Date.now();
    if (paused) setPaused(false);
  }, [paused]);

  useEffect(() => {
    // Visibility change handler
    const handleVisibility = () => {
      if (document.hidden) {
        setPaused(true);
      } else {
        lastInteraction.current = Date.now();
        setPaused(false);
      }
    };

    // Interaction handlers
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => document.addEventListener(e, resetIdle, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetIdle));
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resetIdle]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const idleMs = Date.now() - lastInteraction.current;
      if (idleMs > 30_000 || document.hidden) {
        setPaused(true);
        return;
      }
      setPaused(false);
      setSeconds((s) => s + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="7" cy="7" r="6" />
        <path d="M7 3.5V7l2.5 1.5" />
      </svg>
      <span className={paused ? "opacity-50" : ""}>
        {String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </span>
    </div>
  );
}
