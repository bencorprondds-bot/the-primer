import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureUser } from "@/lib/ensure-user";
import { db } from "@/lib/db";
import { anthropic } from "@/lib/anthropic";
import { buildSystemPrompt } from "@/lib/tutor-prompt";
import { MAX_TUTOR_TURNS } from "@primer/shared";
import type { StepDefinition } from "@primer/shared/src/content-schema";

interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface RequestBody {
  sessionId?: string;
  problemId: string;
  stepIndex: number;
  message: string;
  problem: {
    title: string;
    context?: string;
    currentStep: StepDefinition;
  };
  studentContext: {
    hintsRevealed: number;
    attempts: number;
    previousAnswers?: string[];
    pMastery?: number;
  };
}

/**
 * POST /api/tutor/message
 *
 * Streams a Socratic tutor response. Creates a new session on
 * first message, continues an existing session when sessionId is provided.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await ensureUser(clerkId);
  const body: RequestBody = await req.json();

  const {
    sessionId,
    problemId,
    message,
    problem,
    studentContext,
  } = body;

  if (!problemId || !message?.trim() || !problem?.currentStep) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Load or create session
  let session: { id: string; messages: TutorMessage[] };

  if (sessionId) {
    const existing = await db.tutorSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing || existing.studentId !== user.id) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }
    const messages = existing.messages as unknown as TutorMessage[];
    const userTurns = messages.filter((m) => m.role === "user").length;
    if (userTurns >= MAX_TUTOR_TURNS) {
      return NextResponse.json(
        { error: "turn_limit_reached", turnsUsed: userTurns },
        { status: 429 }
      );
    }
    session = { id: existing.id, messages };
  } else {
    const created = await db.tutorSession.create({
      data: {
        studentId: user.id,
        problemId,
        model: "claude-haiku-4-5",
        messages: [],
        inputTokens: 0,
        outputTokens: 0,
      },
    });
    session = { id: created.id, messages: [] };

    // Fire engagement event (fire-and-forget)
    db.engagementEvent
      .create({
        data: {
          studentId: user.id,
          eventType: "TUTOR_OPENED",
          metadata: { problemId, sessionId: created.id },
        },
      })
      .catch(() => {});
  }

  // Build conversation for Claude
  const systemPrompt = buildSystemPrompt({
    problemTitle: problem.title,
    problemContext: problem.context,
    currentStep: problem.currentStep,
    hintsRevealed: studentContext.hintsRevealed,
    attempts: studentContext.attempts,
    previousAnswers: studentContext.previousAnswers,
    pMastery: studentContext.pMastery,
  });

  // Append the new user message
  const newUserMessage: TutorMessage = {
    role: "user",
    content: message.trim(),
    timestamp: Date.now(),
  };
  const allMessages = [...session.messages, newUserMessage];

  // Convert to Anthropic format
  const anthropicMessages = allMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Stream the response
  const stream = anthropic.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    system: systemPrompt,
    messages: anthropicMessages,
  });

  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantText += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `event: delta\ndata: ${JSON.stringify({ text: event.delta.text })}\n\n`
              )
            );
          }

          if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens;
          }
        }

        // Get final message for input tokens
        const finalMessage = await stream.finalMessage();
        inputTokens = finalMessage.usage.input_tokens;
        outputTokens = finalMessage.usage.output_tokens;

        // Persist to DB
        const assistantMessage: TutorMessage = {
          role: "assistant",
          content: assistantText,
          timestamp: Date.now(),
        };
        const updatedMessages = [...allMessages, assistantMessage];
        const userTurns = updatedMessages.filter(
          (m) => m.role === "user"
        ).length;

        await db.tutorSession.update({
          where: { id: session.id },
          data: {
            messages: updatedMessages as unknown as object[],
            inputTokens: { increment: inputTokens },
            outputTokens: { increment: outputTokens },
          },
        });

        // Send final metadata event
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({
              sessionId: session.id,
              turnsUsed: userTurns,
              inputTokens,
              outputTokens,
            })}\n\n`
          )
        );

        controller.close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
