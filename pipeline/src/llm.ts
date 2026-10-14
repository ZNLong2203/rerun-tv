/**
 * One structured call to a model, with an on-disk cache so re-running the
 * pipeline (or a judge running it from a clean clone) never pays twice for
 * the same prompt.
 *
 * Gemini is the default (GEMINI_API_KEY); Claude works too (ANTHROPIC_API_KEY
 * or an `ant auth login` profile). RERUN_PROVIDER picks one explicitly.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

export type Provider = "gemini" | "claude";

export const DEFAULT_MODELS: Record<Provider, string> = {
  gemini: "gemini-3.8-flash",
  claude: "claude-opus-5-5",
};

export interface Usage {
  calls: number;
  cached: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export function newUsage(): Usage {
  return { calls: 0, cached: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
}

export interface StructuredCall<S extends z.ZodType> {
  /** Stable, cacheable prefix: instructions plus the whole script. */
  system: string[];
  user: string;
  schema: S;
  /** Name used for the cache file and logs. */
  label: string;
}

/** What a provider returns before validation. */
interface RawReply {
  json: unknown;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

type Backend = (call: StructuredCall<z.ZodType>) => Promise<RawReply>;

/** JSON Schema for structured output, without the $schema key Gemini rejects. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function gemini(model: string): Backend {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return async (call) => {
    const response = await ai.models.generateContent({
      model,
      contents: call.user,
      config: {
        systemInstruction: call.system.join("\n\n"),
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(call.schema),
        // Choosing what to teach in a line is judgement, not recall.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    });
    const text = response.text;
    if (!text) throw new Error(`${call.label}: empty reply (${response.candidates?.[0]?.finishReason ?? "no reason"})`);
    const usage = response.usageMetadata;
    return {
      json: JSON.parse(text),
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: usage?.candidatesTokenCount ?? 0,
      cacheReadTokens: usage?.cachedContentTokenCount ?? 0,
    };
  };
}

function claude(model: string): Backend {
  const client = new Anthropic();
  return async (call) => {
    const system = call.system.map((text, i) => ({
      type: "text" as const,
      text,
      // Cache up to the end of the last stable block (the script).
      ...(i === call.system.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(call.schema) },
      system,
      messages: [{ role: "user", content: call.user }],
    });
    if (response.stop_reason === "refusal") {
      throw new Error(`${call.label}: the model declined (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") throw new Error(`${call.label}: output hit max_tokens; use smaller chunks`);
    if (response.parsed_output == null) throw new Error(`${call.label}: no parseable output`);
    return {
      json: response.parsed_output,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    };
  };
}

/** Provider from RERUN_PROVIDER, else whichever key is configured (Gemini first). */
export function pickProvider(env: NodeJS.ProcessEnv = process.env): Provider {
  const explicit = env.RERUN_PROVIDER?.trim().toLowerCase();
  if (explicit === "gemini" || explicit === "claude") return explicit;
  if (explicit) throw new Error(`RERUN_PROVIDER must be "gemini" or "claude", not "${explicit}"`);
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "claude";
  throw new Error("Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in .env.local — see .env.example");
}

export class StructuredLLM {
  readonly usage: Usage = newUsage();
  private readonly backend: Backend;

  constructor(
    readonly provider: Provider,
    readonly model: string,
    private readonly cacheDir: string,
  ) {
    this.backend = provider === "gemini" ? gemini(model) : claude(model);
  }

  private cachePath(call: StructuredCall<z.ZodType>): string {
    const key = createHash("sha256")
      .update(JSON.stringify([this.provider, this.model, call.system, call.user, call.label]))
      .digest("hex")
      .slice(0, 24);
    return join(this.cacheDir, `${call.label}-${key}.json`);
  }

  async parse<S extends z.ZodType>(call: StructuredCall<S>): Promise<z.infer<S>> {
    const path = this.cachePath(call);
    try {
      const hit = call.schema.parse(JSON.parse(await readFile(path, "utf8")));
      this.usage.cached++;
      return hit;
    } catch {
      // Not cached yet, or the schema changed since; ask the model.
    }

    const reply = await this.backend(call);
    this.usage.calls++;
    this.usage.inputTokens += reply.inputTokens;
    this.usage.outputTokens += reply.outputTokens;
    this.usage.cacheReadTokens += reply.cacheReadTokens;

    // The provider promised the schema; check anyway before anything is written.
    const parsed = call.schema.safeParse(reply.json);
    if (!parsed.success) throw new Error(`${call.label}: reply does not match the schema: ${parsed.error.message}`);

    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(path, JSON.stringify(parsed.data, null, 1));
    return parsed.data;
  }
}
