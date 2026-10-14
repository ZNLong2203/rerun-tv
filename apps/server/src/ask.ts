/**
 * "What does this line mean?" — a live question about the line on screen,
 * answered in the learner's language with the whole script as context.
 * Optional: without Claude credentials the route answers 503 and the app
 * still works on the prepared notes alone.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { EnrichedTrack } from "@rerun/core";

export const ASK_MODEL = process.env.RERUN_ASK_MODEL ?? "claude-opus-5-5";

const LANGUAGE_NAMES: Record<string, string> = {
  vi: "Vietnamese",
  es: "Spanish",
  hi: "Hindi",
  id: "Indonesian",
  ja: "Japanese",
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

export class Asker {
  private client: Anthropic | undefined;

  private getClient(): Anthropic {
    this.client ??= new Anthropic();
    return this.client;
  }

  async ask(input: AskInput): Promise<string> {
    const cue = input.track.cues.find((c) => c.id === input.cueId);
    if (!cue) throw new Error("no such line");
    const language = LANGUAGE_NAMES[input.lang] ?? "English";
    const script = input.track.cues.map((c) => `[${c.id}] ${c.text}`).join("\n");

    let client: Anthropic;
    try {
      client = this.getClient();
    } catch (err) {
      throw new AskUnavailableError(err instanceof Error ? err.message : String(err));
    }

    try {
      const response = await client.beta.messages.create({
        model: ASK_MODEL,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text:
              `You help someone learning English while they watch the film "${input.title}" on a TV. ` +
              `Answer in ${language}, in at most 3 short sentences that fit on a TV card. ` +
              `Explain the English in this scene; quote English words in their original form. ` +
              `If the question is not about the film or its language, say briefly that you can only help with the film.`,
          },
          { type: "text", text: `Script:\n${script}`, cache_control: { type: "ephemeral" } },
        ],
        messages: [
          {
            role: "user",
            content: `Line on screen [${cue.id}]: "${cue.text}"\n\nQuestion: ${input.question}`,
          },
        ],
      });
      if (response.stop_reason === "refusal") return "—";
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AskUnavailableError("Claude credentials are missing or invalid");
      }
      throw err;
    }
  }
}
