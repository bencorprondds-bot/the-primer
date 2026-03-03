"use client";

import { useState, useRef, useEffect } from "react";
import { MathText } from "@primer/math-renderer";
import { MAX_TUTOR_TURNS } from "@primer/shared";
import type { TutorMessage } from "@/hooks/use-tutor-chat";

interface TutorPanelProps {
  messages: TutorMessage[];
  turnsUsed: number;
  isStreaming: boolean;
  turnLimitReached: boolean;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}

export function TutorPanel({
  messages,
  turnsUsed,
  isStreaming,
  turnLimitReached,
  onSend,
  onClose,
}: TutorPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="w-full sm:w-80 md:w-96 flex flex-col border-l border-border bg-blue-50/50 dark:bg-blue-950/10 animate-slide-in-right fixed inset-0 sm:static sm:inset-auto z-50 sm:z-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-base">AI Tutor</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close tutor"
        >
          &times;
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Ask me anything about this problem. I&apos;ll help you think through it!
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border"
              }`}
            >
              {msg.role === "assistant" ? (
                msg.content ? (
                  <MathText content={msg.content} />
                ) : (
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                )
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Turn counter + Input */}
      <div className="border-t border-border px-4 py-3 bg-background/80 backdrop-blur-sm">
        {turnLimitReached ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            You&apos;ve used all {MAX_TUTOR_TURNS} messages for this problem.
            Try using the hints or ask your teacher.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask a question..."
                disabled={isStreaming}
                className="flex-1 px-3 py-2 min-h-[44px] text-sm border border-border rounded-lg bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="px-3 py-2 min-h-[44px] bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm font-medium transition-colors"
              >
                Send
              </button>
            </div>
            {turnsUsed > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                {turnsUsed} of {MAX_TUTOR_TURNS} messages used
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
