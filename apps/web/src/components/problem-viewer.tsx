"use client";

import { MathText } from "@primer/math-renderer";
import { useState, useCallback, useRef } from "react";
import type { ProblemDefinition } from "@primer/shared/src/content-schema";

interface ProblemViewerProps {
  problem: ProblemDefinition;
  onComplete?: (results: StepResult[]) => void;
}

interface StepResult {
  stepId: string;
  correct: boolean;
  attempts: number;
  hintsUsed: number;
}

export function ProblemViewer({ problem, onComplete }: ProblemViewerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(
    null
  );
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentStep = problem.steps[currentStepIndex];
  const isLastStep = currentStepIndex === problem.steps.length - 1;

  const checkAnswer = useCallback(() => {
    // Read from DOM ref as fallback — controlled state can desync during hydration
    const inputValue = inputRef.current?.value ?? answer;
    if (!currentStep || !inputValue.trim()) return;

    // Sync React state if it was stale
    if (inputValue !== answer) setAnswer(inputValue);

    const normalized = inputValue.trim().toLowerCase();
    const correct =
      normalized === currentStep.correctAnswer.toLowerCase() ||
      (currentStep.acceptableFormats?.some(
        (f) => normalized === f.toLowerCase()
      ) ??
        false);

    setAttempts((a) => a + 1);

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
    attempts,
    hintsRevealed,
    isLastStep,
    stepResults,
    onComplete,
  ]);

  const revealHint = useCallback(() => {
    if (currentStep && hintsRevealed < currentStep.hints.length) {
      setHintsRevealed((h) => h + 1);
    }
  }, [currentStep, hintsRevealed]);

  if (completed) {
    const totalAttempts = stepResults.reduce((s, r) => s + r.attempts, 0);
    const totalHints = stepResults.reduce((s, r) => s + r.hintsUsed, 0);

    return (
      <div className="border border-green-500/30 bg-green-500/5 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">🎉</div>
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
    <div className="border border-border rounded-lg p-6 space-y-4">
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
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          Step {currentStepIndex + 1} of {problem.steps.length}
        </div>
        <div className="text-lg">
          <MathText content={currentStep.prompt} />
        </div>

        {/* Answer input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
            placeholder="Type your answer..."
            className={`flex-1 px-4 py-2 border rounded-lg bg-background text-foreground outline-none focus:ring-2 transition-colors ${
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
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium transition-colors"
          >
            Check
          </button>
        </div>

        {/* Feedback */}
        {feedback === "correct" && (
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <span>✓</span> Correct!
            {currentStep.explanation && (
              <span className="text-sm text-muted-foreground ml-2">
                <MathText content={currentStep.explanation} />
              </span>
            )}
          </div>
        )}
        {feedback === "incorrect" && (
          <div className="text-red-500 text-sm font-medium">
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
          {hintsRevealed < currentStep.hints.length &&
            feedback !== "correct" && (
              <button
                onClick={revealHint}
                className="text-sm text-amber-600 hover:text-amber-500 transition-colors"
              >
                💡 Show hint ({hintsRevealed}/{currentStep.hints.length})
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
