// components/VocabQuiz.tsx
import { useState, useMemo } from "react";
import type { MCQ } from "../types";
import { Card, SectionTitle } from "./ui";

type Props = { questions: MCQ[]; onFinished: (score: number) => void };

export default function VocabQuiz({ questions, onFinished }: Props) {
  // 固定以 10 題為滿分；若題庫不足 10 題就以實際題數為準
  const total = useMemo(() => Math.min(10, questions.length), [questions.length]);
  const quiz = useMemo(() => questions.slice(0, total), [questions, total]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const cur = quiz[idx];

  function reset() {
    setIdx(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }

  function choose(i: number) {
    if (picked !== null || done) return;
    setPicked(i);
    const correct = i === cur.correctIndex;
    const nextScore = correct ? score + 1 : score;
    if (correct) setScore(nextScore);

    setTimeout(() => {
      const isLast = idx + 1 >= total;
      if (isLast) {
        setDone(true);
        onFinished(nextScore);
      } else {
        setIdx((x) => x + 1);
        setPicked(null);
      }
    }, 650);
  }

  // —— 結果畫面 —— //
  if (done) {
    const passed = score >= Math.ceil(total * 0.7); // 7/10 視為通關
    return (
      <Card>
        <div className={`flex items-center gap-3 mb-3 ${passed ? "text-green-700" : "text-amber-700"}`}>
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
              passed ? "bg-green-100" : "bg-amber-100"
            }`}
          >
            {passed ? "✓" : "!"}
          </div>
          <SectionTitle
            title={passed ? "恭喜通關！" : "再接再厲！"}
            desc={`得分：${score} / ${total}`}
          />
        </div>

        <div className="p-4 rounded-xl border bg-white">
          <div className="text-sm text-neutral-600">
            {passed ? "表現很棒！繼續挑戰更高分數吧！" : "差一點點就過關了，再試一次！"}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-xl border bg-neutral-900 text-white hover:opacity-90"
            >
              再來一次
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // —— 作答畫面 —— //
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle
          title={`單字小測 (${idx + 1}/${total})`}
          desc={`目前得分：${score} / ${total}`}
        />
        {/* 小進度條（美化用） */}
        <div className="w-40 h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-2 bg-neutral-900 transition-all"
            style={{ width: `${((idx) / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="text-base font-medium mb-3">{cur.prompt}</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {cur.choices.map((c, i) => {
          const correct = picked !== null && i === cur.correctIndex;
          const wrong = picked !== null && i === picked && i !== cur.correctIndex;
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              className={`p-3 rounded-xl border text-left transition ${
                correct
                  ? "bg-green-100 border-green-300"
                  : wrong
                  ? "bg-red-100 border-red-300"
                  : "bg-white border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {String.fromCharCode(65 + i)}. {c}
            </button>
          );
        })}
      </div>

      {picked !== null && cur.explain && (
        <div className="text-sm text-neutral-500 mt-3">提示：{cur.explain}</div>
      )}
    </Card>
  );
}
