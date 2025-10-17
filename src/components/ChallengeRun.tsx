// components/ChallengeRun.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { UnitConfig } from "../types";
import { Card, SectionTitle } from "./ui";
import { makeChallengeSet } from "../lib/questionGen";

// ---- 題目/回顧型別（在這檔內就好，避免大改 types.ts）----
export type MCQ = {
  id?: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explain?: string;
  tag?: string;
};

export type RunReportItem = {
  id?: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  pickedIndex: number | null; // null => 超時/未作答
  explain?: string;
  isCorrect: boolean;
};

export type RunReport = { items: RunReportItem[] };

// 單題倒數（每題秒數）
function usePerQuestionTimer(secs: number, runningKey: string | number) {
  const [left, setLeft] = useState(secs);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // 切題或重新開始時重置
    setLeft(secs);
    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      setLeft((l) => (l <= 0 ? 0 : l - 1));
    }, 1000) as unknown as number;

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [secs, runningKey]);

  return left;
}

type Props = {
  unit: UnitConfig;
  // 若有固定題庫就吃這個（例如 unit1/level1），否則用 makeChallengeSet
  fixedSet?: {
    meta?: { time?: number; title?: string };
    questions: MCQ[];
  };
  // 每題秒數（建議 20）
  perQuestionTime?: number;
  // 通關後回傳「分數、花費秒數、詳解清單」
  onFinish: (score: number, timeUsed: number, report?: RunReport) => void;
};

export default function ChallengeRun({
  unit,
  fixedSet,
  perQuestionTime = 20,
  onFinish,
}: Props) {
  // 題庫
  const QUESTIONS: MCQ[] = useMemo(
    () => fixedSet?.questions ?? makeChallengeSet(unit, 10),
    [unit.id, fixedSet]
  );

  // 狀態
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [report, setReport] = useState<RunReportItem[]>([]);
  const startedAt = useRef<number>(0);

  // 每題倒數：依「目前題號＋started」重置
  const left = usePerQuestionTimer(perQuestionTime, `${started}-${idx}`);

  const cur = QUESTIONS[idx];

  // 超時 -> 直接記錄為未作答並進下一題 / 或結束
  useEffect(() => {
    if (!started) return;
    if (left === 0 && !reveal) {
      // 未作答記錄
const item: RunReportItem = {
  id: cur.id,
  prompt: cur.prompt,
  choices: cur.choices,
  correctIndex: cur.correctIndex,
  pickedIndex: null,
  explain: cur.explain,
  isCorrect: false,
  // ★ 新增：把題目上的 tag 帶出來
  // @ts-ignore
  tag: (cur as any).tag,
};
      setReport((r) => [...r, item]);

      setReveal(true);
      // 稍微顯示一下正解色塊（跟點選行為一致）
      setTimeout(() => {
        if (idx + 1 >= QUESTIONS.length) {
          finishRun();
        } else {
          setIdx((n) => n + 1);
          setSelectedIdx(null);
          setReveal(false);
        }
      }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, started]);

  function start() {
    setStarted(true);
    setIdx(0);
    setScore(0);
    setSelectedIdx(null);
    setReveal(false);
    setReport([]);
    startedAt.current = Date.now();
  }

  function finishRun() {
    const used = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    onFinish(score, used, { items: report });
  }

  function choose(i: number) {
    if (!started || reveal) return;
    setSelectedIdx(i);

    const correct = i === cur.correctIndex;
    if (correct) setScore((s) => s + 1);

    // 紀錄本題詳解
const item: RunReportItem = {
  id: cur.id,
  prompt: cur.prompt,
  choices: cur.choices,
  correctIndex: cur.correctIndex,
  pickedIndex: i,
  explain: cur.explain,
  isCorrect: correct,
  // ★ 新增
  // @ts-ignore
  tag: (cur as any).tag,
};
    setReport((r) => [...r, item]);

    // 顯示即時回饋：選到者紅或綠 & 正解一定綠
    setReveal(true);

    setTimeout(() => {
      // 進下一題或結束
      if (idx + 1 >= QUESTIONS.length) {
        finishRun();
      } else {
        setIdx((n) => n + 1);
        setSelectedIdx(null);
        setReveal(false);
      }
    }, 450);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle
          title={`挑戰題 (${started ? idx + 1 : 0}/${QUESTIONS.length})`}
          desc={`每題 ${perQuestionTime} 秒`}
        />
        {started ? (
          <div
            className={`px-3 py-1 rounded-xl text-sm font-semibold ${
              left <= 5 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            ⏱ 剩餘 {left}s
          </div>
        ) : null}
      </div>

      {!started ? (
        <button
          onClick={start}
          className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm"
        >
          開始挑戰
        </button>
      ) : (
        <>
          <div className="text-base font-semibold mb-3">{cur.prompt}</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cur.choices.map((c, i) => {
              const isCorrect = i === cur.correctIndex;
              const isPicked = i === selectedIdx;

              // 回饋樣式
              let cls =
                "p-3 rounded-xl border text-left transition select-none focus:outline-none";
              if (reveal) {
                if (isCorrect) {
                  cls += " bg-green-50 border-green-400 ring-1 ring-green-300 animate-pulse";
                } else if (isPicked) {
                  cls += " bg-red-50 border-red-400 ring-1 ring-red-300 animate-pulse";
                } else {
                  cls += " bg-white opacity-80";
                }
              } else {
                cls += " bg-white hover:bg-neutral-50";
              }

              return (
                <button
                  key={i}
                  disabled={reveal}
                  onClick={() => choose(i)}
                  className={cls}
                >
                  {String.fromCharCode(65 + i)}. {c}
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}