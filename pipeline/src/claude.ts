/**
 * One structured call to Claude, with an on-disk cache so re-running the
 * pipeline (or a judge running it from a clean clone) never pays twice for
 * the same prompt.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const DEFAULT_MODEL = "claude-opus-5-5";

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

export class ClaudeClient {
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    private readonly cacheDir: string,
    readonly usage: Usage = newUsage(),
  ) {
    this.client = new Anthropic();
  }

  private cachePath(call: StructuredCall<z.ZodType>): string {
    const key = createHash("sha256")
      .update(JSON.stringify([this.model, call.system, call.user, call.label]))
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

    const system = call.system.map((text, i) => ({
      type: "text" as const,
      text,
      // Cache up to the end of the last stable block (the script).
      ...(i === call.system.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(call.schema) },
      system,
      messages: [{ role: "user", content: call.user }],
    });

    this.usage.calls++;
    this.usage.inputTokens += response.usage.input_tokens;
    this.usage.outputTokens += response.usage.output_tokens;
    this.usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      throw new Error(`${call.label}: the model declined (${response.stop_details?.category ?? "no category"})`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(`${call.label}: output hit max_tokens; use smaller chunks`);
    }
    const parsed = response.parsed_output;
    if (parsed == null) throw new Error(`${call.label}: no parseable output`);

    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(path, JSON.stringify(parsed, null, 1));
    return parsed as z.infer<S>;
  }
}
