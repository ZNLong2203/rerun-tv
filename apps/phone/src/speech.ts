/**
 * Thin wrapper over the Web Speech API's recognition, which browsers still
 * ship under a prefix and without types. Needs a secure context (HTTPS or
 * localhost) for the microphone.
 */

interface RecognitionResult {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
}

interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupport(): "ok" | "insecure" | "unsupported" {
  if (!ctor()) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  return "ok";
}

export interface Listening {
  stop(): void;
}

/** Listen for one utterance; calls onPartial while speaking and onDone once. */
export function listen(
  lang: string,
  onPartial: (text: string) => void,
  onDone: (text: string, error?: string) => void,
): Listening | undefined {
  const Ctor = ctor();
  if (!Ctor) return undefined;
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  let text = "";
  let error: string | undefined;
  rec.onresult = (e) => {
    text = Array.from(e.results)
      .map((r) => r[0].transcript)
      .join(" ")
      .trim();
    onPartial(text);
  };
  rec.onerror = (e) => {
    error = e.error;
  };
  rec.onend = () => onDone(text, error);
  rec.start();
  return { stop: () => rec.stop() };
}
