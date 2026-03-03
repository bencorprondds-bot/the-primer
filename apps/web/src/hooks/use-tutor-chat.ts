"use client";

import { useState, useCallback, useRef } from "react";
import type { StepDefinition } from "@primer/shared/src/content-schema";

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface UseTutorChatOptions {
  problemId: string;
  problem: { title: string; context?: string };
  currentStep: StepDefinition;
  hintsRevealed: number;
  attempts: number;
  pMastery?: number;
}

interface UseTutorChatReturn {
  messages: TutorMessage[];
  turnsUsed: number;
  isStreaming: boolean;
  turnLimitReached: boolean;
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
}

export function useTutorChat(
  options: UseTutorChatOptions
): UseTutorChatReturn {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [turnLimitReached, setTurnLimitReached] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  // Capture previous wrong answers to pass as context
  const previousAnswersRef = useRef<string[]>([]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || turnLimitReached) return;

      const userMessage: TutorMessage = {
        role: "user",
        content: text.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);

      // Add a placeholder for the assistant response
      const placeholderTimestamp = Date.now();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: placeholderTimestamp },
      ]);

      try {
        const res = await fetch("/api/tutor/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            problemId: options.problemId,
            stepIndex: 0,
            message: text.trim(),
            problem: {
              title: options.problem.title,
              context: options.problem.context,
              currentStep: options.currentStep,
            },
            studentContext: {
              hintsRevealed: options.hintsRevealed,
              attempts: options.attempts,
              previousAnswers: previousAnswersRef.current,
              pMastery: options.pMastery,
            },
          }),
        });

        if (res.status === 429) {
          setTurnLimitReached(true);
          // Remove the empty placeholder
          setMessages((prev) =>
            prev.filter((m) => m.timestamp !== placeholderTimestamp)
          );
          setIsStreaming(false);
          return;
        }

        if (!res.ok || !res.body) {
          // Remove the empty placeholder
          setMessages((prev) =>
            prev.filter((m) => m.timestamp !== placeholderTimestamp)
          );
          setIsStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines
          const events = buffer.split("\n\n");
          // Last chunk may be incomplete — keep it in the buffer
          buffer = events.pop() ?? "";

          for (const event of events) {
            if (!event.trim()) continue;
            let eventType = "";
            let eventData = "";
            for (const line of event.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }
            if (!eventType || !eventData) continue;

            try {
              const data = JSON.parse(eventData);
              if (eventType === "delta" && data.text) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
              } else if (eventType === "done") {
                sessionIdRef.current = data.sessionId;
                setTurnsUsed(data.turnsUsed);
              } else if (eventType === "error") {
                console.error("Tutor stream error:", data.error);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        console.error("Tutor chat error:", err);
        // Remove the empty placeholder on error
        setMessages((prev) =>
          prev.filter(
            (m) =>
              !(m.role === "assistant" && m.timestamp === placeholderTimestamp)
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, turnLimitReached, options]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setTurnsUsed(0);
    setIsStreaming(false);
    setTurnLimitReached(false);
    sessionIdRef.current = null;
    previousAnswersRef.current = [];
  }, []);

  return {
    messages,
    turnsUsed,
    isStreaming,
    turnLimitReached,
    sendMessage,
    reset,
  };
}
