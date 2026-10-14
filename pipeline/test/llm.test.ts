import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonSchemaFor, pickProvider } from "../src/llm.js";

describe("pickProvider", () => {
  it("prefers an explicit RERUN_PROVIDER", () => {
    expect(pickProvider({ RERUN_PROVIDER: "claude", GEMINI_API_KEY: "x" })).toBe("claude");
    expect(pickProvider({ RERUN_PROVIDER: " Gemini " })).toBe("gemini");
  });

  it("falls back to whichever key is set, Gemini first", () => {
    expect(pickProvider({ GEMINI_API_KEY: "x", ANTHROPIC_API_KEY: "y" })).toBe("gemini");
    expect(pickProvider({ ANTHROPIC_API_KEY: "y" })).toBe("claude");
  });

  it("explains what to set when nothing is configured", () => {
    expect(() => pickProvider({})).toThrow(/GEMINI_API_KEY/);
    expect(() => pickProvider({ RERUN_PROVIDER: "openai" })).toThrow(/gemini.*claude/);
  });
});

describe("jsonSchemaFor", () => {
  it("drops $schema and keeps enums and descriptions", () => {
    const json = jsonSchemaFor(z.object({ level: z.enum(["A1", "B2"]).describe("CEFR") }));
    expect(json.$schema).toBeUndefined();
    expect(JSON.stringify(json)).toContain('"enum":["A1","B2"]');
    expect(JSON.stringify(json)).toContain("CEFR");
  });
});
