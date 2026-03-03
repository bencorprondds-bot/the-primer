"use client";

import { MathText } from "@primer/math-renderer";
import { useState, useCallback, useRef } from "react";
import type { ProblemDefinition } from "@primer/shared/src/content-schema";
import { checkAnswer as checkAnswerShared } from "@primer/shared";
import { useTutorChat } from "@/hooks/use-tutor-chat";
import { TutorPanel } from "./tutor-panel";

interface ProblemViewerProps {
  /** The DB problem ID (for response tracking) */
  problemId: string;
  problem: ProblemDefinition;
  onComplete?: (results: StepResult[]) => void;
  /** Mastery context for the AI tutor */
  targetKc?: { pMastery: number };
}

interface StepResult {
  stepId: string;
  correct: boolean;
  attempts: number;
  hintsUsed: number;
}

export function ProblemViewer({ problemId, problem, onComplete, targetKc }: ProblemViewerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(
    null
  );
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepStartTime = useRef(Date.now());

  const currentStep = problem.steps[currentStepIndex];
  const isLastStep = currentStepIndex === problem.steps.length - 1;

  const tutor = useTutorChat({
    problemId,
    problem: { title: problem.title, context: problem.context },
    currentStep: currentStep ?? problem.steps[0],
    hintsRevealed,
    attempts,
    pMastery: targetKc?.pMastery,
  });

  const checkAnswer = useCallback(() => {
    // Read from DOM ref as fallback — controlled state can desync during hydration
    const inputValue = inputRef.current?.value ?? answer;
    if (!currentStep || !inputValue.trim()) return;

    // Sync React state if it was stale
    if (inputValue !== answer) setAnswer(inputValue);

    const correct = checkAnswerShared(
      inputValue,
      currentStep.correctAnswer,
      currentStep.acceptableFormats
    );

    setAttempts((a) => a + 1);

    // Record response + BKT update (fire-and-forget — don't block UI)
    const responseTimeMs = Date.now() - stepStartTime.current;
    fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problemId,
        stepIndex: currentStepIndex,
        correct,
        responseTimeMs,
        hintsUsed: hintsRevealed,
        attemptNumber: attempts + 1,
        kcIds: currentStep.kcs,
      }),
    }).catch(() => {
      // Silent fail — don't break the learning flow for tracking errors
    });

    if (correct) {
      setFeedback("correct");
      const result: StepResult = {
        stepId: currentStep.id,
        correct: true,
        attempts: attempts + 1,
        hintsUsed: hintsRevealed,
      };

      const newResults = [...stepResults, result];
      setStepResults(newResults);

      // Auto-advance after a brief pause
      setTimeout(() => {
        if (isLastStep) {
          setCompleted(true);
          onComplete?.(newResults);
        } else {
          setCurrentStepIndex((i) => i + 1);
          setAnswer("");
          if (inputRef.current) inputRef.current.value = "";
          setFeedback(null);
          setHintsRevealed(0);
          setAttempts(0);
          setTutorOpen(false);
          tutor.reset();
          stepStartTime.current = Date.now();
        }
      }, 1200);
    } else {
      setFeedback("incorrect");
      // Clear incorrect feedback after a moment
      setTimeout(() => setFeedback(null), 2000);
    }
  }, [
    answer,
    currentStep,
    currentStepIndex,
    problemId,
    attempts,
    hintsRevealed,
    isLastStep,
    stepResults,
    onComplete,
    tutor,
  ]);

  const revealHint = useCallback(() => {
    if (currentStep && hintsRevealed < currentStep.hints.length) {
      setHintsRevealed((h) => h + 1);
    }
  }, [currentStep, hintsRevealed]);

  if (completed) {
    const totalAttempts = stepResults.reduce((s, r) => s + r.attempts, 0);
    const totalHints = stepResults.reduce((s, r) => s + r.hintsUsed, 0);
    const allFirstAttempt = stepResults.every((r) => r.attempts === 1);
    const usedBottomOut = stepResults.some(
      (r) => r.hintsUsed >= (problem.steps.find((s) => s.id === r.stepId)?.hints.length ?? 0) && r.hintsUsed > 0
    );
    const stars = allFirstAttempt ? 3 : usedBottomOut ? 1 : 2;

    return (
      <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-6 text-center animate-fade-in">
        <div className="text-3xl mb-3 animate-pop">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={i < stars ? "opacity-100" : "opacity-20"}>
              ⭐
            </span>
          ))}
        </div>
        <h3 className="text-xl font-semibold mb-2">Problem Complete!</h3>
        <p className="text-muted-foreground">
          {problem.steps.length} steps · {totalAttempts} attempts · {totalHints}{" "}
          hints used
        </p>
      </div>
    );
  }

  if (!currentStep) return null;

  return (
    <div className={`border border-border rounded-lg overflow-hidden ${tutorOpen ? "flex flex-col sm:flex-row" : ""}`}>
      <div className={`p-4 sm:p-6 space-y-4 ${tutorOpen ? "flex-1 min-w-0" : ""}`}>
      {/* Problem title and context */}
      <div>
        <h3 className="font-semibold text-lg">{problem.title}</h3>
        {problem.context && (
          <div className="mt-2 text-muted-foreground">
            <MathText content={problem.context} />
          </div>
        )}
      </div>

      {/* Step progress */}
      <div className="flex gap-1">
        {problem.steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < currentStepIndex
                ? "bg-green-500"
                : i === currentStepIndex
                  ? "bg-primary"
                  : "bg-border"
            }`}
          />
        ))}
      </div>

      {/* Current step */}
      <div key={currentStepIndex} className="space-y-3 animate-fade-in">
        <div className="text-sm text-muted-foreground">
          Step {currentStepIndex + 1} of {problem.steps.length}
        </div>
        <div className="text-lg">
          <MathText content={currentStep.prompt} />
        </div>

        {/* Answer input */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
            placeholder="Type your answer..."
            className={`flex-1 px-4 py-2 min-h-[44px] text-base border rounded-lg bg-background text-foreground outline-none focus:ring-2 transition-colors ${
              feedback === "correct"
                ? "border-green-500 focus:ring-green-500/30"
                : feedback === "incorrect"
                  ? "border-red-500 focus:ring-red-500/30"
                  : "border-border focus:ring-primary/30"
            }`}
            disabled={feedback === "correct"}
          />
          <button
            onClick={checkAnswer}
            disabled={feedback === "correct"}
            className="px-4 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium transition-colors"
          >
            Check
          </button>
        </div>

        {/* Feedback */}
        {feedback === "correct" && (
          <div className="flex items-center gap-2 text-green-600 font-medium animate-pop">
            <span>✓</span> Correct!
            {currentStep.explanation && (
              <span className="text-sm text-muted-foreground ml-2">
                <MathText content={currentStep.explanation} />
              </span>
            )}
          </div>
        )}
        {feedback === "incorrect" && (
          <div className="text-red-500 text-sm font-medium animate-shake">
            Not quite. Try again, or use a hint.
          </div>
        )}

        {/* Hints */}
        <div className="space-y-2">
          {currentStep.hints.slice(0, hintsRevealed).map((hint, i) => (
            <div
              key={i}
              className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm"
            >
              <span className="font-medium text-amber-700 dark:text-amber-400">
                Hint {i + 1}:{" "}
              </span>
              <MathText content={hint.content} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 items-center">
            {hintsRevealed < currentStep.hints.length &&
              feedback !== "correct" && (
                <button
                  onClick={revealHint}
                  className="text-sm text-amber-600 hover:text-amber-500 transition-colors min-h-[44px] px-2"
                >
                  💡 Show hint ({hintsRevealed}/{currentStep.hints.length})
                </button>
              )}
            {feedback !== "correct" && !tutorOpen && (
              <button
                onClick={() => setTutorOpen(true)}
                className="text-sm text-blue-600 hover:text-blue-500 transition-colors min-h-[44px] px-2"
              >
                Ask for help
              </button>
            )}
          </div>
        </div>
      </div>
      </div>
      {tutorOpen && (
        <TutorPanel
          messages={tutor.messages}
          turnsUsed={tutor.turnsUsed}
          isStreaming={tutor.isStreaming}
          turnLimitReached={tutor.turnLimitReached}
          onSend={tutor.sendMessage}
          onClose={() => setTutorOpen(false)}
        />
      )}
    </div>
  );
}
