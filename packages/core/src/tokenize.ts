/**
 * Split a subtitle line into tokens a remote can focus.
 *
 * Contractions ("you're", "don't") and hyphenated words ("so-called") stay
 * whole, because that is how a learner hears and looks them up. Punctuation,
 * ellipses and dashes become their own non-word tokens so the line can be
 * re-assembled exactly as written.
 */

export interface Token {
  /** Position in the line's token list. */
  index: number;
  /** Exactly as written in the subtitle. */
  text: string;
  /** Lowercase, curly quotes straightened; "" for punctuation. */
  norm: string;
  /** True for anything a learner might want to look up. */
  isWord: boolean;
  /** Whether a space preceded this token in the original line. */
  spaceBefore: boolean;
}

// A word: letters/digits, optionally joined by an apostrophe or hyphen.
const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/uy;

export function normaliseWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'");
}

export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let spaceBefore = false;
  while (i < line.length) {
    const ch = line[i]!;
    if (/\s/u.test(ch)) {
      spaceBefore = true;
      i++;
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(line);
    if (word) {
      tokens.push({
        index: tokens.length,
        text: word[0],
        norm: normaliseWord(word[0]),
        isWord: true,
        spaceBefore,
      });
      i += word[0].length;
    } else {
      // Group runs of the same mark, like "..." or "!!", into one token.
      let j = i + 1;
      while (j < line.length && line[j] === ch) j++;
      tokens.push({ index: tokens.length, text: line.slice(i, j), norm: "", isWord: false, spaceBefore });
      i = j;
    }
    spaceBefore = false;
  }
  return tokens;
}

/** Re-assemble tokens into display text (inverse of tokenize for one line). */
export function detokenize(tokens: readonly Token[]): string {
  return tokens.map((t, i) => (i > 0 && t.spaceBefore ? " " : "") + t.text).join("");
}

/**
 * Find where a phrase (e.g. "freaked out") sits in a token list, matching word
 * tokens case-insensitively and ignoring punctuation between them. Returns the
 * [start, end) token range, or undefined if the phrase is not in the line.
 *
 * Used to anchor model output to the line deterministically: the model names
 * the phrase, the code decides where it is.
 */
export function locatePhrase(
  tokens: readonly Token[],
  phrase: string,
  fromToken = 0,
): [number, number] | undefined {
  const target = tokenize(phrase).filter((t) => t.isWord).map((t) => t.norm);
  if (target.length === 0) return undefined;
  for (let s = fromToken; s < tokens.length; s++) {
    if (!tokens[s]!.isWord || tokens[s]!.norm !== target[0]) continue;
    let k = 1;
    let e = s + 1;
    while (k < target.length && e < tokens.length) {
      const t = tokens[e]!;
      if (!t.isWord) {
        e++;
        continue;
      }
      if (t.norm !== target[k]) break;
      k++;
      e++;
    }
    if (k === target.length) return [s, e];
  }
  return undefined;
}
