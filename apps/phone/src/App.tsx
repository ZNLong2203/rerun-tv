import { useEffect, useMemo, useState } from "react";
import { scoreShadowing, type CardView, type ShadowScore } from "@rerun/core";
import { api, clipUrl, type Profile } from "./api";
import { inlineRuns } from "./markdown";
import { useRoom, type Now } from "./room";
import { listen, speechSupport, type Listening } from "./speech";

type Tab = "now" | "words" | "ask" | "household";

/** Learner languages the prepared tracks ship notes in. */
const LANGS: Record<string, string> = {
  vi: "Tiếng Việt",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  "pt-PT": "Português",
  id: "Bahasa Indonesia",
};
const LEVELS = [
  ["A1", "Just starting"],
  ["A2", "Everyday basics"],
  ["B1", "Can follow simple shows"],
  ["B2", "Can follow most shows"],
  ["C1", "Comfortable, misses slang"],
  ["C2", "Near native"],
] as const;
const COLORS = ["#F59E0B", "#38BDF8", "#A78BFA", "#34D399", "#F472B6", "#F87171"];

function codeFromHash(): string | undefined {
  const code = location.hash.replace(/^#/, "").trim().toUpperCase();
  return code || undefined;
}

export function App() {
  const [code, setCode] = useState(codeFromHash);
  const [tab, setTab] = useState<Tab>("now");
  const room = useRoom(code);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    const onHash = () => setCode(codeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    api.profiles().then(setProfiles).catch(() => setProfiles([]));
  }, [room.saved.length]);

  const profile = profiles.find((p) => p.id === room.now?.profileId);

  if (!code || room.status === "unknown-code") {
    return <JoinScreen invalid={room.status === "unknown-code"} onJoin={(c) => (location.hash = c)} />;
  }

  return (
    <div className="app" style={{ ["--accent" as string]: profile?.color ?? "#F59E0B" }}>
      <header className="top">
        <div className="brand">
          Rerun<span className="dot">.</span>
        </div>
        <div className={`status ${room.status === "open" && room.tvOnline ? "ok" : ""}`}>
          {room.status !== "open" ? "Connecting…" : room.tvOnline ? `TV · ${code}` : "Waiting for the TV"}
        </div>
      </header>

      {profile && (
        <div className="who">
          <span className="avatar" style={{ background: profile.color }}>
            {profile.name[0]}
          </span>
          <span>
            {profile.name} · {profile.level} · {LANGS[profile.nativeLang] ?? profile.nativeLang}
          </span>
        </div>
      )}

      <main>
        {tab === "now" && <NowTab now={room.now} profile={profile} send={room.send} />}
        {tab === "words" && <WordsTab profile={profile} fresh={room.saved} />}
        {tab === "ask" && <AskTab now={room.now} profile={profile} />}
        {tab === "household" && (
          <HouseholdTab
            profiles={profiles}
            onCreated={(p) => {
              setProfiles((ps) => [...ps, p]);
              room.send({ type: "profiles.changed" });
            }}
          />
        )}
      </main>

      <nav className="tabs">
        {(
          [
            ["now", "Now"],
            ["words", `Words${room.saved.length ? ` · ${room.saved.length}` : ""}`],
            ["ask", "Ask"],
            ["household", "Household"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function JoinScreen({ invalid, onJoin }: { invalid: boolean; onJoin: (code: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="join">
      <div className="brand big">
        Rerun<span className="dot">.</span>
      </div>
      <p>Scan the QR code on your TV, or type the code it shows.</p>
      {invalid && <p className="warn">That code is not active any more. Open “Pair phone” on the TV for a new one.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onJoin(value.trim().toUpperCase());
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="7KQ2M"
          maxLength={5}
          autoCapitalize="characters"
          autoComplete="off"
        />
        <button type="submit">Join</button>
      </form>
    </div>
  );
}

// ── Now: the line on the TV, a remote, and shadowing ─────────────────────

function NowTab({ now, profile, send }: { now: Now | undefined; profile: Profile | undefined; send: ReturnType<typeof useRoom>["send"] }) {
  const support = speechSupport();
  const [listening, setListening] = useState<Listening>();
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<ShadowScore>();
  const cue = now?.cue;

  useEffect(() => {
    setResult(undefined);
    setHeard("");
  }, [cue?.id]);

  if (!now?.titleId) {
    return (
      <section className="empty">
        <p>Start a film on the TV. The line you are hearing shows up here, so you can say it back.</p>
      </section>
    );
  }

  const start = () => {
    if (!cue) return;
    setResult(undefined);
    setHeard("");
    // Hold the line on screen, and keep the film's sound out of the microphone.
    send({ type: "remote", action: "pause" });
    const l = listen(
      "en-US",
      setHeard,
      (text) => {
        setListening(undefined);
        const score = scoreShadowing(cue.text, text);
        setResult(score);
        send({ type: "shadow.result", cueId: cue.id, score: score.score, heard: text });
      },
    );
    setListening(l);
  };

  return (
    <section>
      <div className="line-card">
        <div className="label">On screen</div>
        <p className="line">{cue?.text ?? "…"}</p>
        {cue?.translation && <p className="translation">{cue.translation}</p>}
      </div>

      <div className="remote">
        <button onClick={() => send({ type: "remote", action: "previous" })} aria-label="Previous line">
          ⏮
        </button>
        <button onClick={() => send({ type: "remote", action: "replay" })} aria-label="Replay line">
          ↺
        </button>
        <button className="primary" onClick={() => send({ type: "remote", action: "toggle" })} aria-label="Play or pause">
          ⏯
        </button>
        <button onClick={() => send({ type: "remote", action: "next" })} aria-label="Next line">
          ⏭
        </button>
      </div>

      <div className="shadow">
        <div className="label">Say it back</div>
        {support === "ok" ? (
          <>
            <button
              className={`mic ${listening ? "live" : ""}`}
              disabled={!cue}
              onClick={() => (listening ? listening.stop() : start())}
            >
              {listening ? "Listening… tap to stop" : "🎙  Tap, then say the line"}
            </button>
            {heard && !result && <p className="heard">“{heard}”</p>}
            {result && <ShadowResult result={result} />}
            {!listening && !result && <p className="muted small">The film pauses while you speak.</p>}
          </>
        ) : (
          <p className="muted">
            {support === "insecure"
              ? "The microphone needs HTTPS. Open this page through the server's public HTTPS address."
              : "This browser has no speech recognition. Chrome on Android or Safari on iPhone do."}
          </p>
        )}
      </div>
      {profile && <p className="muted small">Saved words appear in Words the moment you save them on the TV.</p>}
    </section>
  );
}

function ShadowResult({ result }: { result: ShadowScore }) {
  const verdict = result.score >= 90 ? "Spot on" : result.score >= 70 ? "Nearly" : result.score >= 40 ? "Getting there" : "Try once more";
  return (
    <div className="result">
      <div className="score">
        <span>{result.score}</span>
        <small>{verdict}</small>
      </div>
      <p className="words">
        {result.words.map((w, i) => (
          <span key={i} className={w.outcome} title={w.heard ? `heard “${w.heard}”` : undefined}>
            {w.word}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}

// ── Words: the deck, live ─────────────────────────────────────────────────

function WordsTab({ profile, fresh }: { profile: Profile | undefined; fresh: CardView[] }) {
  const [cards, setCards] = useState<CardView[]>([]);
  const [playing, setPlaying] = useState<string>();

  useEffect(() => {
    if (profile) api.cards(profile.id).then(setCards).catch(() => setCards([]));
  }, [profile?.id, fresh.length]);

  const freshIds = useMemo(() => new Set(fresh.map((c) => c.id)), [fresh]);
  if (!profile) return <section className="empty"><p>Pick who is watching on the TV to see their words.</p></section>;
  if (cards.length === 0) {
    return (
      <section className="empty">
        <p>No words yet. On the TV, press ▲ during a line, pick a word, and press OK twice.</p>
      </section>
    );
  }

  return (
    <section className="cards">
      {cards.map((c) => (
        <article key={c.id} className={`card ${freshIds.has(c.id) ? "fresh" : ""}`}>
          <div className="card-head">
            <h3>{c.surface}</h3>
            {c.lemma !== c.surface.toLowerCase() && <span className="lemma">{c.lemma}</span>}
          </div>
          <p className="meaning">{c.meaning}</p>
          <p className="in-line">
            <Highlight text={c.line} phrase={c.surface} />
          </p>
          <p className="translation small">{c.lineTranslation}</p>
          <div className="card-actions">
            <button onClick={() => setPlaying(playing === c.id ? undefined : c.id)}>
              {playing === c.id ? "Hide scene" : "▶ Scene"}
            </button>
            <button
              className="ghost"
              onClick={async () => {
                await api.deleteCard(c.id);
                setCards((cs) => cs.filter((x) => x.id !== c.id));
              }}
            >
              Remove
            </button>
          </div>
          {playing === c.id && (
            <video className="clip" src={clipUrl(c.titleId, c.start, c.end)} autoPlay controls playsInline />
          )}
        </article>
      ))}
    </section>
  );
}

function Highlight({ text, phrase }: { text: string; phrase: string }) {
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + phrase.length)}</mark>
      {text.slice(i + phrase.length)}
    </>
  );
}

// ── Ask: a question about the line on screen ─────────────────────────────

const SUGGESTIONS = ["Why is it said this way?", "Is this rude or friendly?", "How would I use this at work?"];

function AskTab({ now, profile }: { now: Now | undefined; profile: Profile | undefined }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cue = now?.cue;

  const ask = async (q: string) => {
    if (!now?.titleId || !cue || !q.trim()) return;
    setBusy(true);
    setError(undefined);
    setAnswer(undefined);
    try {
      const r = await api.ask({ titleId: now.titleId, cueId: cue.id, question: q, lang: profile?.nativeLang ?? "en" });
      setAnswer(r.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!cue) return <section className="empty"><p>Pause on a line on the TV, then ask about it here.</p></section>;

  return (
    <section>
      <div className="line-card">
        <div className="label">About this line</div>
        <p className="line">{cue.text}</p>
      </div>
      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => { setQuestion(s); void ask(s); }}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask in any language" />
        <button disabled={busy || !question.trim()}>{busy ? "…" : "Ask"}</button>
      </form>
      {answer && (
        <div className="answer">
          {inlineRuns(answer).map((r, i) => (r.bold ? <strong key={i}>{r.text}</strong> : r.italic ? <em key={i}>{r.text}</em> : r.text))}
        </div>
      )}
      {error && <p className="warn">{error}</p>}
    </section>
  );
}

// ── Household: profiles, created on the phone because typing on a TV hurts ─

function HouseholdTab({ profiles, onCreated }: { profiles: Profile[]; onCreated: (p: Profile) => void }) {
  const [name, setName] = useState("");
  const [nativeLang, setNativeLang] = useState("vi");
  const [level, setLevel] = useState<Profile["level"]>("B1");
  const [color, setColor] = useState(COLORS[profiles.length % COLORS.length]!);
  const [error, setError] = useState<string>();

  return (
    <section>
      <div className="household">
        {profiles.map((p) => (
          <div key={p.id} className="member">
            <span className="avatar" style={{ background: p.color }}>
              {p.name[0]}
            </span>
            <div>
              <strong>{p.name}</strong>
              <div className="muted small">
                {p.level} · {LANGS[p.nativeLang] ?? p.nativeLang} · {p.stats?.saved ?? 0} words · {p.stats?.known ?? 0} known
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        className="new-profile"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const p = await api.createProfile({ name: name.trim(), nativeLang, level, color });
            onCreated(p);
            setName("");
            setError(undefined);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <div className="label">Add someone</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={24} required />
        <select value={nativeLang} onChange={(e) => setNativeLang(e.target.value)}>
          {Object.entries(LANGS).map(([code, label]) => (
            <option key={code} value={code}>
              Explain in {label}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as Profile["level"])}>
          {LEVELS.map(([l, d]) => (
            <option key={l} value={l}>
              English {l} — {d}
            </option>
          ))}
        </select>
        <div className="swatches">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={c === color ? "on" : ""}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>
        <button type="submit">Add to the TV</button>
        {error && <p className="warn">{error}</p>}
      </form>
    </section>
  );
}
