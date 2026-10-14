/**
 * "What does this line mean?" — a live question about the line on screen,
 * answered in the learner's language with the whole script as context.
 * Optional: without a model key the route answers 503 and the app still
 * works on the prepared notes alone.
 *
 * Gemini by default (GEMINI_API_KEY); Claude when RERUN_PROVIDER=claude or
 * only ANTHROPIC_API_KEY is set.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { EnrichedTrack } from "@rerun/core";

const LANGUAGE_NAMES: Record<string, string> = {
  vi: "Vietnamese",
  es: "Spanish",
  hi: "Hindi",
  id: "Indonesian",
  ja: "Japanese",
  de: "German",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  "pt-PT": "European Portuguese",
  en: "English",
};

export interface AskInput {
  title: string;
  track: EnrichedTrack;
  cueId: number;
  question: string;
  lang: string;
}

export class AskUnavailableError extends Error {}

type Answer = (system: string, script: string, user: string) => Promise<string>;

function geminiAnswer(model: string): Answer {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return async (system, script, user) => {
    const response = await ai.models.generateContent({
      model,
      contents: user,
      config: {
        systemInstruction: `${system}\n\nScript:\n${script}`,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(20_000),
      },
    });
    return response.text?.trim() ?? "";
  };
}

function claudeAnswer(model: string): Answer {
  const client = new Anthropic();
  return async (system, script, user) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [
        { type: "text", text: system },
        { type: "text", text: `Script:\n${script}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") return "—";
    return response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  };
}

export class Asker {
  private readonly answer: Answer;
  readonly provider: "gemini" | "claude";
  readonly model: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const explicit = env.RERUN_PROVIDER?.trim().toLowerCase();
    this.provider = explicit === "claude" || (!explicit && !env.GEMINI_API_KEY && env.ANTHROPIC_API_KEY) ? "claude" : "gemini";
    if (this.provider === "gemini" && !env.GEMINI_API_KEY) throw new AskUnavailableError("GEMINI_API_KEY is not set");
    this.model = env.RERUN_ASK_MODEL || (this.provider === "gemini" ? "gemini-3.8-flash" : "claude-opus-5-5");
    this.answer = this.provider === "gemini" ? geminiAnswer(this.model) : claudeAnswer(this.model);
  }

  async ask(input: AskInput): Promise<string> {
    const cue = input.track.cues.find((c) => c.id === input.cueId);
    if (!cue) throw new Error("no such line");
    const language = LANGUAGE_NAMES[input.lang] ?? "English";
    const script = input.track.cues.map((c) => `[${c.id}] ${c.text}`).join("\n");
    const system =
      `You help someone learning English while they watch the film "${input.title}" on a TV. ` +
      `Answer in ${language}, in at most 3 short sentences that fit on a TV card. ` +
      `Explain the English in this scene; quote English words in their original form. ` +
      `If the question is not about the film or its language, say briefly that you can only help with the film.`;
    const user = `Line on screen [${cue.id}]: "${cue.text}"\n\nQuestion: ${input.question}`;

    try {
      return await this.answer(system, script, user);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AskUnavailableError("Claude credentials are missing or invalid");
      }
      if (err instanceof Error && /API key not valid|PERMISSION_DENIED|UNAUTHENTICATED/i.test(err.message)) {
        throw new AskUnavailableError("The Gemini API key is missing or invalid");
      }
      throw err;
    }
  }
}

/** An Asker if a model is configured, otherwise undefined (the route answers 503). */
export function createAsker(env: NodeJS.ProcessEnv = process.env): Asker | undefined {
  if (env.RERUN_ASK === "off") return undefined;
  try {
    return new Asker(env);
  } catch (err) {
    if (err instanceof AskUnavailableError) return undefined;
    throw err;
  }
}
