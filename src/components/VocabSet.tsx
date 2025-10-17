import { useEffect, useRef, useState, useMemo } from "react";
import type { Word } from "../types";
import { Card, SectionTitle } from "./ui";

type Props = { title?: string; words: Word[]; onStudied: () => void };

/* ------------------ 工具 ------------------ */
function normalizeLetters(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ""); }

type LetterHint = { ch: string; ok: boolean; extra?: boolean };

function buildLetterHints(targetRaw: string, saidRaw: string): {
  targetHints: LetterHint[]; saidHints: LetterHint[];
} {
  const T = normalizeLetters(targetRaw).split("");
  const S = normalizeLetters(saidRaw).split("");
  const m = T.length, n = S.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const cost = T[i - 1] === S[j - 1] ? 0 : 1;
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
  }
  let i = m, j = n;
  const steps: Array<{ t?: string; s?: string; match: boolean; op: "M"|"S"|"D"|"I" }> = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = T[i - 1] === S[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        steps.push({ t: T[i - 1], s: S[j - 1], match: cost === 0, op: cost === 0 ? "M" : "S" });
        i--; j--; continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { steps.push({ t: T[i - 1], match: false, op: "D" }); i--; continue; }
    steps.push({ s: S[j - 1], match: false, op: "I" }); j--;
  }
  steps.reverse();
  const targetHints: LetterHint[] = [], saidHints: LetterHint[] = [];
  for (const st of steps) {
    if (st.t !== undefined) targetHints.push({ ch: st.t, ok: st.match });
    if (st.s !== undefined) saidHints.push({ ch: st.s, ok: st.match, extra: st.op === "I" });
  }
  console.log("[HINT] steps:", steps);
  console.log("[HINT] targetHints:", targetHints);
  console.log("[HINT] saidHints:", saidHints);
  return { targetHints, saidHints };
}

function isCloseMatch(said: string, target: string) {
  const a = normalizeLetters(said), b = normalizeLetters(target);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const cut = Math.max(2, Math.floor(b.length * 0.6));
  return a.startsWith(b.slice(0, cut));
}

/* ------------------ Fireworks 元件 ------------------ */
type StyleVars = React.CSSProperties & { ['--dx']?: string; ['--dy']?: string };

function Fireworks() {
  // 固定 18 個火花 + 1 個擴散圈
  const pieces = useMemo(() => {
    const arr: { dx: number; dy: number; cls: string; bar?: boolean }[] = [];
    for (let k = 0; k < 18; k++) {
      const angle = (Math.PI * 2 * k) / 18 + Math.random() * 0.4;
      const dist = 42 + Math.random() * 26; // 爆開半徑
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const cls = ["bg-emerald-400","bg-amber-400","bg-indigo-400","bg-rose-400","bg-cyan-400"][k % 5];
      arr.push({ dx, dy, cls, bar: k % 3 === 0 });
    }
    return arr;
  }, []);

  return (
    <div className="fireworks">
      <div className="fireworks__ring" />
      {pieces.map((p, i) => {
        const style: StyleVars = { ['--dx']: `${p.dx}px`, ['--dy']: `${p.dy}px` };
        return (
          <span
            key={i}
            className={`fireworks__spark ${p.bar ? "fireworks__spark--bar" : ""} ${p.cls}`}
            style={style}
          />
        );
      })}
    </div>
  );
}

/* ------------------ 主元件 ------------------ */
export default function VocabSet({ title = "單字集", words, onStudied }: Props) {
  console.log("[VocabSet] mount. words:", words);

  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [passed, setPassed] = useState<Record<number, boolean>>({});
  const [heard, setHeard] = useState<Record<number, string>>({});
  const [listeningIdx, setListeningIdx] = useState<number | null>(null);

  const [fails, setFails] = useState<Record<number, number>>({});
  const [shakeIdx, setShakeIdx] = useState<number | null>(null);

  // ✅ 通過後觸發煙火（1.1 秒）
  const [burst, setBurst] = useState<Record<number, boolean>>({});

  // 逐字母提示資料
  const [letterHints, setLetterHints] = useState<
    Record<number, { targetHints: LetterHint[]; saidHints: LetterHint[] }>
  >({});

  const [srSupported, setSrSupported] = useState(true);
  const [ttsSupported, setTtsSupported] = useState(true);

  const recRef = useRef<SpeechRecognition | null>(null);
  const curIdxRef = useRef<number | null>(null);
  const partialRef = useRef<string>("");

  /* ---- 初始化 SR/TTS ---- */
  useEffect(() => {
    const SRCls = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRCls) {
      console.warn("[VocabSet] SpeechRecognition not supported");
      setSrSupported(false);
    } else {
      const r: SpeechRecognition = new SRCls();
      r.lang = "en-US"; r.continuous = false; r.interimResults = true; r.maxAlternatives = 3;
      r.onstart = () => console.log("[SR] onstart idx=", curIdxRef.current);
      r.onresult = (evt: SpeechRecognitionEvent) => {
        let finalText = "";
        for (let k = evt.resultIndex; k < evt.results.length; k++) {
          const res = evt.results[k]; const t = res[0]?.transcript || "";
          console.log("[SR] result", { k, isFinal: res.isFinal, transcript: t });
          if (res.isFinal) finalText += t; else partialRef.current = t;
        }
        const text = (finalText || partialRef.current || "").trim();
        if (text && curIdxRef.current !== null) {
          setHeard((h) => { const next = { ...h, [curIdxRef.current as number]: text }; console.log("[SR] setHeard:", next); return next; });
        }
      };
      r.onerror = (e: any) => { console.warn("[SR] onerror:", e); curIdxRef.current = null; setListeningIdx(null); };
      r.onend = () => {
        console.log("[SR] onend");
        const idx = curIdxRef.current;
        const text = partialRef.current;
        partialRef.current = ""; curIdxRef.current = null; setListeningIdx(null);
        if (idx !== null) {
          const said = text || heard[idx] || "";
          const target = words[idx]?.term ?? "";
          const ok = isCloseMatch(said, target);
          console.log("[SR] match?", { idx, said, target, ok });

          if (ok) {
            setPassed((p) => ({ ...p, [idx]: true }));
            setLetterHints((h) => { const { [idx]: _, ...rest } = h; return rest; });
            // 🔥 觸發煙火
            setBurst((b) => ({ ...b, [idx]: true }));
            console.log("[FX] fireworks -> show", { idx });
            setTimeout(() => {
              setBurst((b) => ({ ...b, [idx]: false }));
              console.log("[FX] fireworks -> hide", { idx });
            }, 1100);
          } else {
            // ⛔️ 這次不正確 -> 一定清成未通過（即使曾通過過）
            setPassed((p) => ({ ...p, [idx]: false }));
            try { "vibrate" in navigator && navigator.vibrate?.(160); } catch {}
            setShakeIdx(idx); setTimeout(() => setShakeIdx((cur) => (cur === idx ? null : cur)), 360);
            setFails((f) => ({ ...f, [idx]: (f[idx] || 0) + 1 }));
            const hints = buildLetterHints(target, said);
            setLetterHints((h) => ({ ...h, [idx]: hints }));
          }
        }
      };
      recRef.current = r;
    }
    if (!("speechSynthesis" in window)) { console.warn("[VocabSet] speechSynthesis not supported"); setTtsSupported(false); }
    return () => { try { recRef.current?.abort(); } catch {} recRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- 全數通過 → 自動 onStudied() ---- */
  useEffect(() => {
    const done = words.length > 0 && words.every((_, i) => !!passed[i]);
    const passedCount = words.filter((_, i) => !!passed[i]).length;
    console.log("[VocabSet] progress:", { passedCount, total: words.length, done });
    if (done) { console.log("[VocabSet] all correct -> onStudied()"); onStudied(); }
  }, [passed, words, onStudied]);

  /* ---- 事件 ---- */
  const flipCard = (idx: number) => {
    setRevealed((r) => { const next = { ...r, [idx]: !r[idx] }; console.log("[UI] flipCard", { idx, toBack: next[idx] === true }); return next; });
  };

  const startListen = (i: number) => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch {}
    // ⭐️ 重新作答：先把該卡「通過」清掉，回到待評分狀態
    setPassed((p) => {
      if (p[i]) console.log("[SR] reattempt -> clear pass", { idx: i });
      return { ...p, [i]: false };
    });
    // 可選：清掉舊提示
    setLetterHints((h) => { const { [i]: _, ...rest } = h; return rest; });

    curIdxRef.current = i; partialRef.current = ""; setListeningIdx(i);
    console.log("[SR] startListen", { idx: i, target: words[i]?.term });
    setTimeout(() => {
      try { recRef.current!.start(); }
      catch (e) {
        console.warn("[SR] start error:", e);
        setListeningIdx(null); curIdxRef.current = null;
      }
    }, 80);
  };

  const stopListen = () => { console.log("[SR] stopListen"); try { recRef.current?.stop(); } catch (e) { console.warn("[SR] stop error:", e); } };

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const prefer = voices.find((v) => /en-(US|GB|AU|CA)/i.test(v.lang));
    if (prefer) u.voice = prefer;
    u.onstart = () => console.log("[TTS] start", { text, voice: u.voice?.name, lang: u.lang });
    u.onend = () => console.log("[TTS] end");
    u.onerror = (e) => console.warn("[TTS] error", e);
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  };

  const markStudied = () => { console.log("[UI] manual onStudied()"); onStudied(); };

  /* ---- UI ---- */
  return (
    <Card>
      <SectionTitle
        title={title}
        desc="點卡片標題可翻面（中⇄英）。按 🔈 聽發音；按 🎤 跟讀。正確→CORRECT＋煙火；錯誤→震動＋逐字母提示。"
      />

      {!srSupported && <div className="mb-3 text-sm text-red-600">你的瀏覽器不支援語音辨識（Web Speech API）。建議使用最新版 Chrome / Edge。</div>}
      {!ttsSupported && <div className="mb-3 text-sm text-amber-700">你的瀏覽器不支援語音合成（speechSynthesis）。將隱藏發音功能。</div>}

      {/* 放大卡片：手機 1 欄、平板 2 欄、桌機 3 欄；間距更寬 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {words.map((w, idx) => {
          const isBack = !!revealed[idx];
          const ok = !!passed[idx];
          const isListening = listeningIdx === idx;
          const said = heard[idx];
          const failedTimes = fails[idx] || 0;
          const pack = letterHints[idx];

          return (
            <div
              key={idx}
              className={[
                "relative rounded-2xl border text-left transition",
                // 放大卡片：更多 padding、高度自動、較大的最小高；文字可換行；內容不外溢
                "p-4 md:p-5 w-full h-auto min-h-[15rem] whitespace-normal break-words overflow-hidden",
                ok ? "border-green-400 bg-green-50" : "border-neutral-200 bg-neutral-50 hover:bg-neutral-100",
                shakeIdx === idx ? "shake-once ring-2 ring-red-300" : "",
              ].join(" ")}
            >
              {/* ✅ 通過徽章 */}
              {ok && <span className="absolute top-2 right-2 text-xs font-semibold text-green-700">CORRECT ✅</span>}

              {/* ✅ 煙火（僅通過瞬間 1.1s 顯示） */}
              {ok && burst[idx] && <Fireworks />}

              {/* 標題（可翻面） */}
              <button onClick={() => flipCard(idx)} className="text-sm text-neutral-500 mb-2 underline decoration-dotted">
                #{idx + 1}（點我翻面）
              </button>

              {/* 主要文字更大 */}
              <div className="text-2xl md:text-[1.75rem] font-semibold">{isBack ? w.term : w.def}</div>
              {isBack && w.example && <div className="text-xs text-neutral-500 mt-1">{w.example}</div>}

              {/* 操作列：僅在英文面顯示 */}
              {isBack && (
                <div className="mt-3 space-y-1">
                  {/* 第一行：固定寬度按鈕，不被拉伸 */}
                  <div className="flex items-center gap-2">
                    {ttsSupported && (
                      <button
                        onClick={() => speak(w.term)}
                        className="px-3 py-1.5 rounded-lg text-sm border bg-white border-neutral-300 hover:bg-neutral-100 w-[84px] flex-none"
                        aria-label="play audio" title="播放發音"
                      >🔈 發音</button>
                    )}
                    {srSupported && (
                      <button
                        onClick={() => (isListening ? stopListen() : startListen(idx))}
                        className={`px-3 py-1.5 rounded-lg text-sm border w-[96px] flex-none ${
                          isListening ? "bg-red-50 border-red-300" : "bg-white border-neutral-300 hover:bg-neutral-100"
                        }`}
                        aria-label="speech recognition" title="讀出英文"
                      >{isListening ? "🛑 停止" : "🎤 跟讀"}</button>
                    )}
                  </div>

                  {/* 第二行：你說（長句自動換行、必要時捲動） */}
                  <div
                    className="text-xs text-neutral-700 break-words whitespace-normal max-h-16 overflow-y-auto pr-1"
                    title={said || ""}
                    aria-live="polite"
                  >
                    {said ? `你說：${said}` : "（尚未錄音）"}
                  </div>
                </div>
              )}

              {/* 逐字母提示：放大字距、限定高度避免溢出（必要時出現捲動） */}
              {!ok && isBack && pack && (
                <div className="mt-2 text-[13px] font-mono leading-6 max-h-28 overflow-y-auto pr-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-neutral-500 mr-1">提示:</span>
                    {pack.targetHints.map((h, i2) => (
                      <span key={i2} className={[
                        "px-1 rounded border",
                        h.ok ? "text-green-700 bg-green-50 border-green-300"
                             : "text-red-700 bg-red-50 border-red-300",
                      ].join(" ")}>{h.ch}</span>
                    ))}
                    <span className="ml-2 text-neutral-500">（第 {failedTimes} 次）</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-neutral-500 mr-1">你說:</span>
                    {pack.saidHints.map((h, i3) => (
                      <span key={i3} className={[
                        "px-1 rounded border",
                        h.extra ? "text-neutral-600 bg-neutral-50 border-neutral-300"
                          : h.ok ? "text-green-700 bg-green-50 border-green-300"
                          : "text-red-700 bg-red-50 border-red-300",
                      ].join(" ")} title={h.extra ? "多唸的字母" : h.ok ? "匹配" : "不匹配"}>{h.ch}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={markStudied} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm">標記為已學習</button>
        <div className="text-xs text-neutral-500">完成條件：每張卡片 CORRECT ✅ 或手動標記。</div>
      </div>
    </Card>
  );
}
