/**
 * Models sometimes answer with **bold** or *italics* even when asked for
 * plain text. Split an answer into runs the page can style instead of
 * showing the asterisks.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const EMPHASIS = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

export function inlineRuns(text: string): Run[] {
  return text
    .split(EMPHASIS)
    .filter((part) => part !== "")
    .map((part) => {
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return { text: part.slice(2, -2), bold: true };
      if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return { text: part.slice(1, -1), italic: true };
      return { text: part };
    });
}
