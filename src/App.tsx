// src/App.tsx
import { useState, useEffect } from "react";
import { UNITS } from "./data/units";
import type { UnitConfig, UnitId, MCQ } from "./types";
import { useProgress } from "./state/progress";
import { makeVocabMCQ } from "./lib/questionGen";

import { TabButton, Card, SectionTitle } from "./components/ui";
import VocabSet from "./components/VocabSet";
import VocabQuiz from "./components/VocabQuiz";
import GrammarExplain from "./components/GrammarExplain";
import ReorderSentenceGame from "./components/ReorderSentenceGame";
import StoryViewer from "./components/StoryViewer";
import ArrangeSentencesGame from "./components/ArrangeSentencesGame";
import BadgesView from "./components/BadgesView";

// 挑戰
import ChallengeRun from "./components/ChallengeRun";
import type { RunReport } from "./components/ChallengeRun";

import SnakeChallenge from "./components/SnakeChallenge";
import type { SnakeReport } from "./components/SnakeChallenge";

// 固定 JSON 題庫（Unit 1 · Level 1）
// 若 tsconfig 已開 resolveJsonModule，下面可直接 import；否則加 // @ts-ignore
// @ts-ignore
import level1 from "./data/challenges/unit-1/level-1.json";

/*// @ts-ignore 題目設定好之後開啟
import level2 from "./data/challenges/unit-1/level-2.json";
// @ts-ignore
import level3 from "./data/challenges/unit-1/level-3.json";
// @ts-ignore
import level4 from "./data/challenges/unit-1/level-4.json";
// @ts-ignore
import level5 from "./data/challenges/unit-1/level-5.json";*/
import { AuthProvider, useAuth } from "./state/AuthContext"; // <-- 匯入 useAuth
import { supabase } from "./supabaseClient"; // <-- 匯入 supabase client
import ProfileSetup from "./components/ProfileSetup";

/* -----------------------------
   類型（僅供本檔使用）
------------------------------ */
type Tab = "learn" | "challenge" | "badges";
type LearnSubTab = "vocab" | "grammar" | "text";
type VocabView = "set" | "quiz" | "snake";
type GrammarView = "explain" | "reorder";
type TextView = "story" | "arrange";
type ChallengeMode = "select" | "play";

type ChallengeItemResult = {
  id?: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  pickedIndex: number | null;
  correct: boolean;
  explain?: string;
  tag?: string;
};

const fixedU1L1: {
  meta?: { time?: number; title?: string };
  questions: MCQ[];
} = level1; /* 預先載入，避免每次切換關卡才載入 
const fixedU1L2: {
  meta?: { time?: number; title?: string };
  questions: MCQ[];
} = level2;
const fixedU1L3: {
  meta?: { time?: number; title?: string };
  questions: MCQ[];
} = level3;
const fixedU1L4: {
  meta?: { time?: number; title?: string };
  questions: MCQ[];
} = level4;
const fixedU1L5: {
  meta?: { time?: number; title?: string };
  questions: MCQ[];
} = level5;*/

/* -----------------------------
   星等 / 解鎖規則
------------------------------ */
function computeLevelStars(score: number) {
  // 10/7/4 → 3★/2★/1★
  if (score >= 10) return 3;
  if (score >= 7) return 2;
  if (score >= 4) return 1;
  return 0;
}
function calcUnlockedCount(
  levels: Record<number, { stars: number; passed?: boolean }> | undefined,
  totalLevels: number
) {
  let unlocked = 1;
  for (let lv = 1; lv <= totalLevels; lv++) {
    const info = levels?.[lv];
    const passed = info?.passed === true;
    const enoughStars = (info?.stars ?? 0) >= 2;
    if (passed || enoughStars) {
      unlocked = Math.min(totalLevels, lv + 1);
    } else {
      break;
    }
  }
  return unlocked;
}

/* -----------------------------
   關卡選單
------------------------------ */
function LevelGrid({
  total = 10,
  unlockedCount,
  starsByLevel,
  onPick,
}: {
  total?: number;
  unlockedCount: number;
  starsByLevel: number[];
  onPick: (level: number) => void;
}) {
  return (
    <Card>
      <SectionTitle title="選擇關卡 (每單元 10 關)" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Array.from({ length: total }, (_, i) => {
          const lv = i + 1;
          const unlocked = lv <= Math.max(1, unlockedCount);
          const stars = starsByLevel[i] ?? 0;
          return (
            <button
              key={lv}
              disabled={!unlocked}
              onClick={() => onPick(lv)}
              className={`p-3 rounded-xl border text-left ${
                unlocked
                  ? "bg-white hover:bg-neutral-50"
                  : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
              }`}
            >
              <div className="text-xs opacity-70">LEVEL {lv}</div>
              <div className="text-sm">
                {"⭐".repeat(stars)}
                {"☆".repeat(3 - stars)}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* -----------------------------
   小工具
------------------------------ */
const letter = (i: number) => String.fromCharCode(65 + i);

/* -----------------------------
   結算 Modal（無「摘要」區塊）
------------------------------ */
function ResultModal({
  open,
  onClose,
  title,
  score,
  total,
  stars,
  timeUsed,
  passed,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  score: number;
  total: number;
  stars: number;
  timeUsed: number;
  passed: boolean;
  items: ChallengeItemResult[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-[61] w-[min(92vw,800px)] max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <div>
            <div className="text-xs text-neutral-500">挑戰完成</div>
            <div className="text-lg font-semibold">{title}</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-sm bg-neutral-100 hover:bg-neutral-200"
          >
            關閉
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="col-span-1 md:col-span-2 rounded-xl border p-4">
            <div className="text-sm text-neutral-500 mb-1">本輪星等</div>
            <div className="text-2xl">
              {"⭐".repeat(stars)}
              {"☆".repeat(3 - stars)}
            </div>
            <div className="mt-2 text-sm">
              分數：<span className="font-semibold">{score}</span> / {total}
            </div>
            <div className="text-sm">
              時間：<span className="font-semibold">{timeUsed}s</span>
            </div>
            <div className="mt-1 text-sm">
              通過：{passed ? "✅ 是" : "❌ 否"}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="text-sm text-neutral-500 mb-2">每題詳解</div>
          <div className="overflow-y-auto max-h-[48vh] pr-1">
            <div className="space-y-3">
              {items.length === 0 ? (
                <div className="text-sm text-neutral-600 p-4 rounded-xl border bg-neutral-50">
                  本關為非選擇題或未提供詳解。
                </div>
              ) : (
                items.map((it, i) => {
                  const picked =
                    it.pickedIndex === null
                      ? "（未作答）"
                      : `${letter(it.pickedIndex)}. ${
                          it.choices[it.pickedIndex]
                        }`;
                  const correct = `${letter(it.correctIndex)}. ${
                    it.choices[it.correctIndex]
                  }`;
                  return (
                    <div
                      key={it.id ?? `i-${i}`}
                      className="rounded-xl border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">
                          {i + 1}. {it.prompt}
                        </div>
                        <div
                          className={`text-sm ${
                            it.correct ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {it.correct ? "✔️ 正確" : "❌ 錯誤"}
                        </div>
                      </div>
                      <div className="mt-1 text-sm">
                        你的作答：<span className="font-medium">{picked}</span>
                      </div>
                      <div className="text-sm">
                        參考答案：<span className="font-medium">{correct}</span>
                      </div>
                      {it.explain && (
                        <div className="mt-1 text-sm text-neutral-700">
                          詳解：{it.explain}
                        </div>
                      )}
                      {it.tag && (
                        <div className="mt-1 text-xs text-neutral-500">
                          分類：{it.tag}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// 【新增一個登入元件】
function AuthGate() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      alert("請檢查您的電子郵件信箱，點擊登入連結！");
    } catch (error: any) {
      alert(error.error_description || error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center">
      <div className="w-full max-w-sm p-8 space-y-6 bg-white rounded-2xl shadow-lg border">
        <div>
          <h1 className="text-2xl font-bold">登入 LearningQuest</h1>
          <p className="text-sm text-neutral-500 mt-1">
            請輸入您的電子郵件以接收登入連結。
          </p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your.email@example.com"
              className="w-full px-4 py-2 border rounded-xl"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 text-white bg-neutral-900 rounded-xl disabled:opacity-50"
          >
            {loading ? "傳送中..." : "傳送登入連結"}
          </button>
        </form>
      </div>
    </div>
  );
}
/* -----------------------------
   App
------------------------------ */
export default function App() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        讀取中...
      </div>
    );
  }
  if (!session) {
    return <AuthGate />;
  }
  if (session && !profile?.full_name) {
    return <ProfileSetup />;
  }
  // 如果已登入，就顯示原本的 LearningQuestApp
  // 為了方便，我把您原本的 App 內容包成一個新元件
  return <LearningQuestApp  />;
}
function LearningQuestApp() {
  // 頁籤 / 視圖狀態
  const [tab, setTab] = useState<Tab>("learn");
  const [unitId, setUnitId] = useState<UnitId>(1);
  const [sub, setSub] = useState<LearnSubTab>("vocab");
  const [vocabView, setVocabView] = useState<VocabView>("set");
  const [grammarView, setGrammarView] = useState<GrammarView>("explain");
  const [textView, setTextView] = useState<TextView>("story");

  // 挑戰區
  const [mode, setMode] = useState<ChallengeMode>("select");
  const [level, setLevel] = useState(1);

  // 資料與進度
  const unit: UnitConfig = UNITS.find((u) => u.id === unitId)!;
  const { progress, addXP, patchUnit, awardBadge, reset, reportGrammarTetris } =
    useProgress();
  const uProg = progress.byUnit[unitId];
  // ✅ 監聽 grammar-tetris-report 事件，交給 progress 判斷是否要頒發 SUPER_GRAMMAR_EXPERT
  useEffect(() => {
    const onReport = (e: Event) => {
      const { detail } = e as CustomEvent<{
        roundsPlayed: number;
        reason: "completed" | "no-fit" | "wrong-limit";
      }>;
      if (!detail) return;
      // ✅ 直接交給 progress：達成「completed 且 roundsPlayed ≥ 80」就會頒發 SUPER_GRAMMAR_EXPERT
      reportGrammarTetris(detail);
    };
    window.addEventListener(
      "learning-quest:grammar-tetris-report",
      onReport as EventListener
    );
    return () =>
      window.removeEventListener(
        "learning-quest:grammar-tetris-report",
        onReport as EventListener
      );
  }, [reportGrammarTetris]);
  // 監聽貪吃蛇成績，達 78 分即頒發 SNAKE_KING
  useEffect(() => {
    const onSnake = (e: Event) => {
      const { detail } = e as CustomEvent<{ correct: number; total: number }>;
      if (!detail) return;
      if (detail.correct >= 78) {
        awardBadge("SNAKE_KING");
        console.log("[badge] SNAKE_KING unlocked via snake-report:", detail);
      }
    };
    window.addEventListener(
      "learning-quest:snake-report",
      onSnake as EventListener
    );
    return () =>
      window.removeEventListener(
        "learning-quest:snake-report",
        onSnake as EventListener
      );
  }, [awardBadge]);

  // 關卡星數（顯示在選單上）
  const starsByLevel = Array.from(
    { length: 10 },
    (_, i) => uProg.challenge.levels?.[i + 1]?.stars ?? 0
  );
  const unlockedCount = calcUnlockedCount(uProg.challenge.levels, 10);

  // 結算 modal 狀態（使用「本輪星等」）
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{
    title: string;
    score: number;
    total: number;
    stars: number;
    timeUsed: number;
    passed: boolean;
    items: ChallengeItemResult[];
  } | null>(null);
  const [pendingNextLevel, setPendingNextLevel] = useState<number | null>(null);

  // —— 結算與進度寫回 —— //
  function handleChallengeFinish(
    score: number,
    timeUsed: number,
    report?: RunReport
  ) {
    // 取出本輪每題詳解（來自 ChallengeRun）
    const itemsFromRun = (report?.items ?? []).map((it: any) => ({
      ...it,
      // 正規化：把 isCorrect 轉成 correct，方便 ResultModal 使用
      correct: typeof it.correct === "boolean" ? it.correct : !!it.isCorrect,
    }));

    // 本輪星等（顯示在 modal）
    const starsThisRun = computeLevelStars(score);

    // 通過條件：關卡 ≥2★
    const passed = starsThisRun >= 2;

    // 歷史最佳（寫回 progress）
    const prevLv = uProg.challenge.levels?.[level] as
      | {
          bestScore: number;
          bestTimeSec: number;
          stars: number;
          passed?: boolean;
        }
      | undefined;

    const newLv = {
      bestScore: Math.max(prevLv?.bestScore ?? 0, score),
      bestTimeSec: prevLv?.bestTimeSec
        ? Math.min(prevLv.bestTimeSec, timeUsed)
        : timeUsed,
      stars: Math.max(prevLv?.stars ?? 0, starsThisRun), // 寫入「歷史最佳星等」
      passed: prevLv?.passed === true ? true : passed, // 一旦通過永久 true
    };

    const bestScore = Math.max(uProg.challenge.bestScore, score);
    const bestTime =
      uProg.challenge.bestTimeSec === 0
        ? timeUsed
        : Math.min(uProg.challenge.bestTimeSec, timeUsed);

    const nextLevels = {
      ...(uProg.challenge.levels || {}),
      [level]: newLv,
    } as Record<
      number,
      {
        bestScore: number;
        bestTimeSec: number;
        stars: number;
        passed?: boolean;
      }
    >;

    const nextUnlocked = calcUnlockedCount(nextLevels, 10);
    const nextCleared = Math.max(
      uProg.challenge.clearedLevels,
      nextUnlocked - 1
    );

    patchUnit(unitId, {
      challenge: {
        clearedLevels: nextCleared,
        bestTimeSec: bestTime,
        bestScore,
        levels: nextLevels,
      },
    });

    // 徽章 & XP
    if (score === 10) awardBadge("PERFECT_10");
    if (timeUsed <= 40) awardBadge("SPEEDSTER");
    addXP(unitId, score * 2);

    // 打開本輪結算（顯示本輪星等＆詳解）
    setModalData({
      title: `Unit ${unitId} · Level ${level}`,
      score,
      total: report?.items?.length ?? 10,
      stars: starsThisRun,
      timeUsed,
      passed,
      items: itemsFromRun,
    });
    setPendingNextLevel(nextUnlocked);
    setModalOpen(true);
  }

  function closeResultModal() {
    setModalOpen(false);
    // 回關卡選單並預選「下一個可玩的關卡」
    setMode("select");
    if (pendingNextLevel) setLevel(pendingNextLevel);
    setPendingNextLevel(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50 text-neutral-900">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold tracking-tight">LearningQuest</div>
          <div className="text-sm text-neutral-500">
            可模組化英語學習 ·{UNITS.length} 單元 · 遊戲化
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TabButton active={tab === "learn"} onClick={() => setTab("learn")}>
            學習區
          </TabButton>
          <TabButton
            active={tab === "challenge"}
            onClick={() => {
              setTab("challenge");
              setMode("select");
              setLevel(calcUnlockedCount(uProg.challenge.levels, 10));
            }}
          >
            挑戰區
          </TabButton>
          <TabButton active={tab === "badges"} onClick={() => setTab("badges")}>
            獎章區
          </TabButton>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-10">
        {/* HUD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card>
            <div className="text-sm text-neutral-500">目前單元</div>
            <div className="text-lg font-semibold">{unit.title}</div>
            <div className="mt-2 text-sm">
              星等：{"⭐".repeat(uProg.stars)}
              {"☆".repeat(3 - uProg.stars)}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-neutral-500">本單元 XP</div>
            <div className="text-2xl font-bold">{uProg.xp}</div>
            <div className="text-sm text-neutral-500">
              總 XP：{progress.totalXP}
            </div>
          </Card>
          <Card>
            <div className="text-sm text-neutral-500">快捷</div>
            <div className="flex gap-2 mt-2">
              <button
                onClick={reset}
                className="px-3 py-2 rounded-xl border text-sm"
              >
                重置進度
              </button>
              <button
                onClick={() =>
                  alert("請在 data/units.ts 中替換成你的題庫即可擴充 6 單元。")
                }
                className="px-3 py-2 rounded-xl border text-sm"
              >
                如何擴充？
              </button>
            </div>
          </Card>
        </div>

        {/* 單元選擇 */}
        <Card>
          <SectionTitle title={`選擇單元 (共 ${UNITS.length})`} />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {UNITS.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setUnitId(u.id);
                  if (tab === "challenge") {
                    setMode("select");
                    const unlockedForThisUnit = calcUnlockedCount(
                      progress.byUnit[u.id].challenge.levels,
                      10
                    );
                    setLevel(unlockedForThisUnit);
                  }
                }}
                className={`p-3 rounded-xl border text-left ${
                  u.id === unitId
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white hover:bg-neutral-50"
                }`}
              >
                <div className="text-xs opacity-80">Unit {u.id}</div>
                <div className="font-semibold truncate">
                  {u.title.replace(/^Unit \d+:\s*/, "")}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* 主區域 */}
        <div className="mt-4 space-y-4">
          {/* 學習區 */}
          {tab === "learn" && (
            <>
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <TabButton
                    active={sub === "vocab"}
                    onClick={() => setSub("vocab")}
                  >
                    1. 單字
                  </TabButton>
                  <TabButton
                    active={sub === "grammar"}
                    onClick={() => setSub("grammar")}
                  >
                    2. 文法
                  </TabButton>
                  <TabButton
                    active={sub === "text"}
                    onClick={() => setSub("text")}
                  >
                    3. 課文
                  </TabButton>
                </div>

                {sub === "vocab" && (
                  <div className="flex items-center gap-2">
                    <TabButton
                      active={vocabView === "set"}
                      onClick={() => setVocabView("set")}
                    >
                      單字集
                    </TabButton>
                    {/*<TabButton active={vocabView === "quiz"} onClick={() => setVocabView("quiz")}>
                      4 選 1 小遊戲
                    </TabButton>*/}
                    <TabButton
                      active={vocabView === "snake"}
                      onClick={() => setVocabView("snake")}
                    >
                      貪吃蛇
                    </TabButton>
                  </div>
                )}

                {sub === "grammar" && (
                  <div className="flex items-center gap-2">
                    <TabButton
                      active={grammarView === "explain"}
                      onClick={() => setGrammarView("explain")}
                    >
                      文法說明
                    </TabButton>
                    <TabButton
                      active={grammarView === "reorder"}
                      onClick={() => setGrammarView("reorder")}
                    >
                      俄羅斯方塊
                    </TabButton>
                  </div>
                )}

                {sub === "text" && (
                  <div className="flex items-center gap-2">
                    <TabButton
                      active={textView === "story"}
                      onClick={() => setTextView("story")}
                    >
                      課文故事
                    </TabButton>
                    <TabButton
                      active={textView === "arrange"}
                      onClick={() => setTextView("arrange")}
                    >
                      句型排列
                    </TabButton>
                  </div>
                )}
              </Card>

              {/* 內容：單字 */}
              {sub === "vocab" &&
                (vocabView === "set" ? (
                  <VocabSet
                    title={`${unit.title} 單字集`}
                    words={unit.words}
                    onStudied={() => {
                      addXP(unitId, 5);
                      patchUnit(unitId, {
                        vocab: {
                          ...uProg.vocab,
                          studied: uProg.vocab.studied + 1,
                        },
                      });
                    }}
                  />
                ) : vocabView === "snake" ? (
                  <SnakeChallenge
                    key={`snake-learn-${unitId}`}
                    title={`單字練習：貪吃蛇`}
                    //totalTime={60}
                    words={unit.words}
                    targetScore={7} // 建議 7 分作為過關門檻（可調）
                    onFinish={(score /*, timeUsed*/) => {
                      // 與 4選1 一致：加 XP、寫入 vocab.quizBest（若要分開統計再另外加欄位）
                      addXP(unitId, score);
                      patchUnit(unitId, {
                        vocab: {
                          ...uProg.vocab,
                          quizBest: Math.max(uProg.vocab.quizBest, score),
                        },
                      });
                    }}
                    onReport={(r: SnakeReport) => {
                      const items: ChallengeItemResult[] = r.logs.map((log) => {
                        const correctIndex = log.options.indexOf(
                          log.correctTerm
                        );
                        const picked = log.options.indexOf(log.selectedTerm);
                        return {
                          id: `snake-${unitId}-${log.round}`,
                          prompt: log.prompt,
                          choices: log.options,
                          correctIndex: correctIndex >= 0 ? correctIndex : 0, // 理論上應該找得到；找不到就先防呆到 0
                          pickedIndex: picked >= 0 ? picked : null, // -1 轉成 null，Modal 會顯示「（未作答）」
                          correct: log.isCorrect,
                          tag: "vocab",
                        };
                      });

                      setModalData({
                        title: r.title || `單字練習：貪吃蛇`,
                        score: r.correct,
                        total: r.totalQuestions,
                        stars: computeLevelStars(r.correct),
                        timeUsed: r.usedTime,
                        passed: r.passed,
                        items,
                      });
                      setModalOpen(true);
                    }}
                  />
                ) : (
                  <VocabQuiz
                    questions={makeVocabMCQ(unit, 80).map((q, i) => ({
                      ...q,
                      id: q.id ?? `vocab-${unit.id}-${i}`, // 補上 id
                    }))}
                    onFinished={(score) => {
                      addXP(unitId, score);
                      patchUnit(unitId, {
                        vocab: {
                          ...uProg.vocab,
                          quizBest: Math.max(uProg.vocab.quizBest, score),
                        },
                      });
                    }}
                  />
                ))}

              {/* 內容：文法 */}
              {sub === "grammar" &&
                (grammarView === "explain" ? (
                  <GrammarExplain
                    points={unit.grammar}
                    onStudied={() => {
                      addXP(unitId, 5);
                      patchUnit(unitId, {
                        grammar: {
                          ...uProg.grammar,
                          studied: uProg.grammar.studied + 1,
                        },
                      });
                    }}
                  />
                ) : (
                  <ReorderSentenceGame
                    targets={unit.grammar.flatMap((g) => g.examples ?? [])}
                    onFinished={(score) => {
                      addXP(unitId, score);
                      patchUnit(unitId, {
                        grammar: {
                          ...uProg.grammar,
                          reorderBest: Math.max(
                            uProg.grammar.reorderBest,
                            score
                          ),
                        },
                      });
                    }}
                  />
                ))}

              {/* 內容：課文 */}
              {sub === "text" &&
                (textView === "story" ? (
                  <StoryViewer
                    story={unit.story}
                    onRead={() => {
                      addXP(unitId, 5);
                      patchUnit(unitId, {
                        text: { ...uProg.text, read: uProg.text.read + 1 },
                      });
                    }}
                  />
                ) : (
                  <ArrangeSentencesGame
                    sentences={unit.story.sentencesForArrange}
                    onFinished={(correct) => {
                      addXP(unitId, correct);
                      patchUnit(unitId, {
                        text: {
                          ...uProg.text,
                          arrangeBest: Math.max(
                            uProg.text.arrangeBest,
                            correct
                          ),
                        },
                      });
                    }}
                  />
                ))}
            </>
          )}

          {/* 挑戰區 */}
          {tab === "challenge" &&
            (mode === "select" ? (
              <LevelGrid
                total={10}
                unlockedCount={unlockedCount}
                starsByLevel={starsByLevel}
                onPick={(lv) => {
                  setLevel(lv);
                  setMode("play");
                }}
              />
            ) : (
              <ChallengeRun
                key={`${unitId}-${level}`}
                unit={unit}
                // @ts-ignore
                perQuestionTime={20}
                fixedSet={
                  unitId === 1
                    ? (
                        {
                          1: fixedU1L1,
                          /*2: fixedU1L2,
                          3: fixedU1L3,
                          4: fixedU1L4,
                          5: fixedU1L5,*/
                        } as const
                      )[level]
                    : undefined
                }
                onFinish={handleChallengeFinish}
              />
            ))}
          {/* 獎章區 */}
          {tab === "badges" && <BadgesView progress={progress} />}
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 text-center text-sm text-neutral-500">
        © {new Date().getFullYear()} LearningQuest · 可自由調整的模組化原型
      </footer>

      {/* 結算 Modal */}
      {modalData && (
        <ResultModal
          open={modalOpen}
          onClose={closeResultModal}
          title={modalData.title}
          score={modalData.score}
          total={modalData.total}
          stars={modalData.stars}
          timeUsed={modalData.timeUsed}
          passed={modalData.passed}
          items={modalData.items}
        />
      )}
    </div>
  );
}
