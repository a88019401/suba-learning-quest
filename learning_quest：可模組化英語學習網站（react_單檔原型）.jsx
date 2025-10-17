import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";

/**
 * LearningQuest — 可模組化英語學習網站（單檔原型）
 * 技術：React + TypeScript + Tailwind（建議）
 * 特色：
 *  - 三大區域：學習區（單字/文法/課文）、挑戰區（6 關限時 4 選 1）、獎章區
 *  - 以 JSON 設定驅動（易擴充 6 個單元的內容、題庫與規則）
 *  - 內建簡易進度儲存（localStorage）與徽章規則引擎
 *  - 遊戲化：XP、星等、計時、連勝提示
 *
 * 用法：把此檔作為專案的首頁組件（例如 Vite/Next 的 App.tsx），搭配 Tailwind。
 * 接著依需求把內容拆成檔案與資料夾。
 */

/****************************
 * 型別宣告
 ****************************/ 
 type UnitId = 1 | 2 | 3 | 4 | 5 | 6;
 type Tab = "learn" | "challenge" | "badges";
 type LearnSubTab = "vocab" | "grammar" | "text";
 type VocabView = "set" | "quiz";
 type GrammarView = "explain" | "reorder";
 type TextView = "story" | "arrange";

 type Word = { term: string; def: string; example?: string };
 type GrammarPoint = { point: string; desc: string; examples: string[] };
 type Story = { title: string; paragraphs: string[]; sentencesForArrange: string[] };
 type MCQ = { id: string; prompt: string; choices: string[]; correctIndex: number; explain?: string; tag?: string };

 type UnitConfig = {
  id: UnitId;
  title: string;
  words: Word[];
  grammar: GrammarPoint[];
  story: Story;
 };

 type UnitProgress = {
  stars: number; // 0-3
  xp: number;
  vocab: { studied: number; quizBest: number };
  grammar: { studied: number; reorderBest: number };
  text: { read: number; arrangeBest: number };
  challenge: { clearedLevels: number; bestTimeSec: number; bestScore: number };
 };

 type Progress = {
  byUnit: Record<UnitId, UnitProgress>;
  badges: Record<string, { unlocked: boolean; unlockedAt?: string }>;
  totalXP: number;
 };

 type Action =
  | { type: "SET_TAB"; tab: Tab }
  | { type: "SET_UNIT"; unit: UnitId }
  | { type: "SET_LEARN_SUBTAB"; sub: LearnSubTab }
  | { type: "SET_VOCAB_VIEW"; view: VocabView }
  | { type: "SET_GRAMMAR_VIEW"; view: GrammarView }
  | { type: "SET_TEXT_VIEW"; view: TextView }
  | { type: "ADD_XP"; unit: UnitId; amount: number }
  | { type: "UPDATE_PROGRESS"; unit: UnitId; patch: Partial<UnitProgress> }
  | { type: "AWARD_BADGE"; key: string }
  | { type: "LOAD"; state: AppState };

 type AppState = {
  tab: Tab;
  unit: UnitId;
  learnSubTab: LearnSubTab;
  vocabView: VocabView;
  grammarView: GrammarView;
  textView: TextView;
  progress: Progress;
 };

/****************************
 * 假資料／模板（請替換為真題庫）
 ****************************/
 const mkUnit = (id: UnitId, title: string): UnitConfig => ({
  id,
  title,
  words: [
    { term: "hello", def: "你好", example: "Hello, my name is Tom." },
    { term: "goodbye", def: "再見", example: "Goodbye! See you tomorrow." },
    { term: "teacher", def: "老師", example: "The teacher is kind." },
    { term: "student", def: "學生", example: "I am a student." },
    { term: "school", def: "學校", example: "Our school is big." },
  ],
  grammar: [
    { point: "be 動詞 (am/is/are)", desc: "主詞 + be + 補語。", examples: ["I am a student.", "She is a teacher.", "They are friends."] },
    { point: "一般現在式", desc: "描述習慣或事實。第三人稱單數動詞+s。", examples: ["He goes to school.", "We play basketball."] },
  ],
  story: {
    title: `${title} — A New Friend`,
    paragraphs: [
      "Tom is new at school. He says hello to everyone.",
      "He meets a teacher and a student in the hallway.",
      "They show him the library and the playground.",
    ],
    sentencesForArrange: [
      "Tom is new at school.",
      "He meets a teacher and a student.",
      "They show him the library.",
      "They play together at the playground.",
    ],
  },
 });

 const UNITS: UnitConfig[] = [
  mkUnit(1, "Unit 1: Greetings"),
  mkUnit(2, "Unit 2: Classroom"),
  mkUnit(3, "Unit 3: Family"),
  mkUnit(4, "Unit 4: Food"),
  mkUnit(5, "Unit 5: Hobbies"),
  mkUnit(6, "Unit 6: Travel"),
 ];

/****************************
 * MCQ 生成器
 ****************************/
 const uid = () => Math.random().toString(36).slice(2, 10);
 const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
 };

 function makeVocabMCQ(unit: UnitConfig, count = 10): MCQ[] {
  const pool = unit.words;
  const qs: MCQ[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const correct = pool[i];
    const distractors = shuffle(pool.filter(w => w.term !== correct.term)).slice(0, 3);
    const all = shuffle([correct.term, ...distractors.map(d => d.term)]);
    qs.push({
      id: `v-${unit.id}-${i}-${uid()}`,
      prompt: `「${correct.def}」的英文是哪一個？`,
      choices: all,
      correctIndex: all.indexOf(correct.term),
      explain: correct.example,
      tag: "vocab",
    });
  }
  return shuffle(qs);
 }

 function makeBeVerbMCQ(unit: UnitConfig, count = 5): MCQ[] {
  const samples = [
    { s: "I __ a student.", c: "am" },
    { s: "She __ a teacher.", c: "is" },
    { s: "They __ friends.", c: "are" },
    { s: "He __ my brother.", c: "is" },
    { s: "We __ in the library.", c: "are" },
  ];
  const forms = ["am", "is", "are", "be"];
  const qs: MCQ[] = samples.slice(0, count).map((it, i) => {
    const choices = shuffle(Array.from(new Set([it.c, ...shuffle(forms).slice(0, 3)]))).slice(0, 4);
    return {
      id: `g-${unit.id}-${i}-${uid()}`,
      prompt: it.s,
      choices,
      correctIndex: choices.indexOf(it.c),
      explain: `主詞與 be 動詞一致：I→am, he/she/it→is, you/we/they→are。`,
      tag: "grammar",
    };
  });
  return shuffle(qs);
 }

 function makeStoryOrderMCQ(unit: UnitConfig, count = 3): MCQ[] {
  // 單純理解題：問「故事第一句是？」等
  const sents = unit.story.sentencesForArrange;
  const qs: MCQ[] = [];
  const orders = [0, 1, 2];
  for (let k of orders.slice(0, Math.min(count, sents.length))) {
    const correct = sents[k];
    const choices = shuffle([correct, ...shuffle(sents.filter((_, i) => i !== k)).slice(0, 3)]);
    qs.push({
      id: `t-${unit.id}-${k}-${uid()}`,
      prompt: `故事中第 ${k + 1} 句是？`,
      choices,
      correctIndex: choices.indexOf(correct),
      explain: `檢查段落順序理解。`,
      tag: "text",
    });
  }
  return shuffle(qs);
 }

 function makeChallengeSet(unit: UnitConfig, total = 10): MCQ[] {
  const mix = [
    ...makeVocabMCQ(unit, Math.min(5, total)),
    ...makeBeVerbMCQ(unit, Math.min(3, total)),
    ...makeStoryOrderMCQ(unit, Math.min(2, total)),
  ];
  return shuffle(mix).slice(0, total);
 }

/****************************
 * 進度 & 徽章邏輯
 ****************************/
 const defaultUnitProgress = (): UnitProgress => ({
  stars: 0,
  xp: 0,
  vocab: { studied: 0, quizBest: 0 },
  grammar: { studied: 0, reorderBest: 0 },
  text: { read: 0, arrangeBest: 0 },
  challenge: { clearedLevels: 0, bestTimeSec: 0, bestScore: 0 },
 });

 const defaultProgress = (): Progress => ({
  byUnit: {
    1: defaultUnitProgress(),
    2: defaultUnitProgress(),
    3: defaultUnitProgress(),
    4: defaultUnitProgress(),
    5: defaultUnitProgress(),
    6: defaultUnitProgress(),
  },
  badges: {
    FIRST_STEPS: { unlocked: false },
    VOCAB_NOVICE: { unlocked: false },
    GRAMMAR_APPRENTICE: { unlocked: false },
    STORY_EXPLORER: { unlocked: false },
    SPEEDSTER: { unlocked: false },
    PERFECT_10: { unlocked: false },
    UNIT_MASTER: { unlocked: false },
  },
  totalXP: 0,
 });

 function awardIf(cond: boolean, key: string, progress: Progress): Progress {
  if (!cond) return progress;
  if (progress.badges[key]?.unlocked) return progress;
  return {
    ...progress,
    badges: {
      ...progress.badges,
      [key]: { unlocked: true, unlockedAt: new Date().toISOString() },
    },
  };
 }

 function evaluateBadges(progress: Progress): Progress {
  let p = { ...progress };
  const anyUnit = Object.values(p.byUnit);
  p = awardIf(anyUnit.some(u => u.vocab.studied >= 1), "FIRST_STEPS", p);
  p = awardIf(anyUnit.some(u => u.vocab.quizBest >= 6), "VOCAB_NOVICE", p);
  p = awardIf(anyUnit.some(u => u.grammar.reorderBest >= 1), "GRAMMAR_APPRENTICE", p);
  p = awardIf(anyUnit.some(u => u.text.read >= 1), "STORY_EXPLORER", p);
  p = awardIf(anyUnit.some(u => u.challenge.bestTimeSec > 0 && u.challenge.bestTimeSec <= 40), "SPEEDSTER", p);
  p = awardIf(anyUnit.some(u => u.challenge.bestScore >= 10), "PERFECT_10", p);
  p = awardIf(anyUnit.some(u => u.stars >= 3), "UNIT_MASTER", p);
  return p;
 }

/****************************
 * Reducer / 儲存
 ****************************/
 const STORAGE_KEY = "learningquest-progress-v1";

 const initialState: AppState = {
  tab: "learn",
  unit: 1,
  learnSubTab: "vocab",
  vocabView: "set",
  grammarView: "explain",
  textView: "story",
  progress: defaultProgress(),
 };

 function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, tab: action.tab };
    case "SET_UNIT":
      return { ...state, unit: action.unit };
    case "SET_LEARN_SUBTAB":
      return { ...state, learnSubTab: action.sub };
    case "SET_VOCAB_VIEW":
      return { ...state, vocabView: action.view };
    case "SET_GRAMMAR_VIEW":
      return { ...state, grammarView: action.view };
    case "SET_TEXT_VIEW":
      return { ...state, textView: action.view };
    case "ADD_XP": {
      const byUnit = { ...state.progress.byUnit };
      const u = { ...byUnit[action.unit] };
      u.xp += action.amount;
      byUnit[action.unit] = u;
      const next: AppState = { ...state, progress: { ...state.progress, byUnit, totalXP: state.progress.totalXP + action.amount } };
      const withBadges = { ...next, progress: evaluateBadges(next.progress) };
      persist(withBadges);
      return withBadges;
    }
    case "UPDATE_PROGRESS": {
      const byUnit = { ...state.progress.byUnit };
      const u = { ...byUnit[action.unit], ...action.patch } as UnitProgress;
      byUnit[action.unit] = u;
      const next: AppState = { ...state, progress: { ...state.progress, byUnit } };
      // 自動估星等：簡單依最佳分數/關卡
      const stars = Math.min(3, Math.floor(((u.vocab.quizBest + u.grammar.reorderBest + u.text.arrangeBest + u.challenge.bestScore / 5) / 5)));
      byUnit[action.unit] = { ...u, stars };
      const withBadges = { ...next, progress: evaluateBadges(next.progress) };
      persist(withBadges);
      return withBadges;
    }
    case "AWARD_BADGE": {
      const p = { ...state.progress };
      p.badges[action.key] = { unlocked: true, unlockedAt: new Date().toISOString() };
      const next = { ...state, progress: p };
      persist(next);
      return next;
    }
    case "LOAD":
      return action.state;
    default:
      return state;
  }
 }

 function persist(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
 }
 function restore(): AppState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AppState } catch { return null }
 }

/****************************
 * UI 輔助
 ****************************/
 const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }>
  = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-2xl text-sm font-medium border transition ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 hover:bg-neutral-100"}`}>
    {children}
  </button>
 );

 const Card: React.FC<{ children: React.ReactNode; className?: string }>
  = ({ children, className }) => (
  <div className={`rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 ${className ?? ""}`}>{children}</div>
 );

 const SectionTitle: React.FC<{ title: string; desc?: string }>
  = ({ title, desc }) => (
  <div className="mb-3">
    <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
    {desc && <p className="text-sm text-neutral-500">{desc}</p>}
  </div>
 );

/****************************
 * 元件：學習區 — 單字
 ****************************/
 const VocabSet: React.FC<{ unit: UnitConfig; onStudied: () => void }>
  = ({ unit, onStudied }) => {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  return (
    <Card>
      <SectionTitle title="單字集 (點擊卡片翻轉)" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {unit.words.map((w, idx) => (
          <button key={idx} onClick={() => setRevealed(r => ({ ...r, [idx]: !r[idx] }))}
            className="h-28 rounded-2xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition p-3 text-left">
            <div className="text-sm text-neutral-500 mb-1">#{idx + 1}</div>
            <div className="text-xl font-semibold">{revealed[idx] ? w.term : w.def}</div>
            {revealed[idx] && <div className="text-xs text-neutral-500 mt-2">{w.example}</div>}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onStudied} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm">標記為已學習 +5 XP</button>
      </div>
    </Card>
  );
 };

 const VocabQuiz: React.FC<{ unit: UnitConfig; onFinished: (score: number) => void }>
  = ({ unit, onFinished }) => {
  const [qs] = useState<MCQ[]>(() => makeVocabMCQ(unit, 8));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const cur = qs[idx];

  function choose(i: number) {
    if (picked !== null) return;
    setPicked(i);
    if (i === cur.correctIndex) setScore(s => s + 1);
    setTimeout(() => {
      if (idx + 1 >= qs.length) onFinished(score + (i === cur.correctIndex ? 1 : 0));
      else { setIdx(idx + 1); setPicked(null); }
    }, 700);
  }

  return (
    <Card>
      <SectionTitle title={`單字小測 (${idx + 1}/${qs.length})`} desc={`得分：${score}`} />
      <div className="text-base font-medium mb-3">{cur.prompt}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {cur.choices.map((c, i) => {
          const correct = picked !== null && i === cur.correctIndex;
          const wrong = picked !== null && i === picked && i !== cur.correctIndex;
          return (
            <button key={i} onClick={() => choose(i)} className={`p-3 rounded-xl border text-left transition ${correct ? "bg-green-100 border-green-300" : wrong ? "bg-red-100 border-red-300" : "bg-white border-neutral-200 hover:bg-neutral-50"}`}>
              {String.fromCharCode(65 + i)}. {c}
            </button>
          );
        })}
      </div>
      {picked !== null && cur.explain && <div className="text-sm text-neutral-500 mt-3">提示：{cur.explain}</div>}
    </Card>
  );
 };

/****************************
 * 元件：學習區 — 文法
 ****************************/
 const GrammarExplain: React.FC<{ unit: UnitConfig; onStudied: () => void }>
  = ({ unit, onStudied }) => (
  <Card>
    <SectionTitle title="文法說明" />
    <div className="space-y-4">
      {unit.grammar.map((g, i) => (
        <div key={i} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
          <div className="font-semibold">{g.point}</div>
          <div className="text-sm text-neutral-600 mt-1">{g.desc}</div>
          <ul className="list-disc pl-6 text-sm mt-2 space-y-1">
            {g.examples.map((e, j) => <li key={j}>{e}</li>)}
          </ul>
        </div>
      ))}
    </div>
    <button onClick={onStudied} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm mt-4">標記為已研讀 +5 XP</button>
  </Card>
 );

 const ReorderSentenceGame: React.FC<{ target: string; onFinished: (ok: boolean) => void }>
  = ({ target, onFinished }) => {
  const tokens = useMemo(() => target.replace(/[.?!]$/, "").split(" "), [target]);
  const [pool, setPool] = useState<string[]>(() => shuffle(tokens));
  const [built, setBuilt] = useState<string[]>([]);

  function pick(i: number) {
    const t = pool[i];
    setPool(p => p.filter((_, k) => k !== i));
    setBuilt(b => [...b, t]);
  }
  function undo(i: number) {
    const t = built[i];
    setBuilt(b => b.filter((_, k) => k !== i));
    setPool(p => [...p, t]);
  }
  function check() {
    const ok = built.join(" ") === tokens.join(" ");
    onFinished(ok);
  }

  return (
    <Card>
      <div className="text-sm text-neutral-500 mb-2">請依正確順序點擊組合句子：</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {pool.map((t, i) => (
          <button key={i} onClick={() => pick(i)} className="px-3 py-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-sm">{t}</button>
        ))}
      </div>
      <div className="p-3 rounded-xl bg-white border border-neutral-200 min-h-[48px] flex flex-wrap gap-2 mb-3">
        {built.map((t, i) => (
          <button key={i} onClick={() => undo(i)} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm">{t}</button>
        ))}
      </div>
      <button onClick={check} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm">完成並檢查</button>
    </Card>
  );
 };

/****************************
 * 元件：學習區 — 課文
 ****************************/
 const StoryViewer: React.FC<{ story: Story; onRead: () => void }>
  = ({ story, onRead }) => (
  <Card>
    <SectionTitle title={`課文：${story.title}`} />
    <div className="space-y-3">
      {story.paragraphs.map((p, i) => (
        <p key={i} className="leading-7 text-neutral-800">{p}</p>
      ))}
    </div>
    <button onClick={onRead} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm mt-4">標記為已閱讀 +5 XP</button>
  </Card>
 );

 const ArrangeSentencesGame: React.FC<{ sentences: string[]; onFinished: (score: number) => void }>
  = ({ sentences, onFinished }) => {
  const target = sentences;
  const [list, setList] = useState<string[]>(() => shuffle(target));
  function move(i: number, dir: -1 | 1) {
    const j = i + dir; if (j < 0 || j >= list.length) return;
    const a = [...list]; [a[i], a[j]] = [a[j], a[i]]; setList(a);
  }
  function finish() {
    const correct = list.filter((s, i) => s === target[i]).length;
    onFinished(correct);
  }
  return (
    <Card>
      <SectionTitle title="句型排列小遊戲" desc="使用↑↓調整順序，完全正確可拿滿分" />
      <ul className="space-y-2">
        {list.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className="flex-1 p-3 rounded-xl border bg-neutral-50">{i + 1}. {s}</div>
            <div className="flex flex-col gap-1">
              <button onClick={() => move(i, -1)} className="px-2 py-1 rounded-lg border bg-white">↑</button>
              <button onClick={() => move(i, +1)} className="px-2 py-1 rounded-lg border bg-white">↓</button>
            </div>
          </li>
        ))}
      </ul>
      <button onClick={finish} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm mt-3">完成並計分</button>
    </Card>
  );
 };

/****************************
 * 元件：挑戰區（限時 4 選 1）
 ****************************/
 const useCountdown = (secs: number, running: boolean) => {
  const [left, setLeft] = useState(secs);
  const ref = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return; setLeft(secs);
    const tick = () => setLeft(l => (l <= 0 ? 0 : l - 1));
    ref.current = window.setInterval(tick, 1000);
    return () => { if (ref.current) window.clearInterval(ref.current) };
  }, [secs, running]);
  return left;
 };

 const ChallengeRun: React.FC<{ unit: UnitConfig; onFinish: (score: number, timeUsed: number) => void }>
  = ({ unit, onFinish }) => {
  const QUESTIONS = useMemo(() => makeChallengeSet(unit, 10), [unit.id]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const totalTime = 60; // 秒
  const [started, setStarted] = useState(false);
  const left = useCountdown(totalTime, started);

  useEffect(() => { if (started && left === 0) onFinish(score, totalTime); }, [left, started]);

  const cur = QUESTIONS[idx];

  function start() { setStarted(true); }
  function choose(i: number) {
    if (!started) return;
    const correct = i === cur.correctIndex;
    if (correct) setScore(s => s + 1);
    setTimeout(() => {
      if (idx + 1 >= QUESTIONS.length) onFinish(correct ? score + 1 : score, totalTime - left);
      else setIdx(idx + 1);
    }, 250);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle title={`挑戰題 (${idx + 1}/${QUESTIONS.length})`} desc="限時 60 秒" />
        <div className={`px-3 py-1 rounded-xl text-sm font-semibold ${left <= 10 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-700"}`}>⏱ 剩餘 {left}s</div>
      </div>
      {!started ? (
        <button onClick={start} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm">開始挑戰</button>
      ) : (
        <>
          <div className="text-base font-medium mb-3">{cur.prompt}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {cur.choices.map((c, i) => (
              <button key={i} onClick={() => choose(i)} className="p-3 rounded-xl border bg-white hover:bg-neutral-50 text-left">
                {String.fromCharCode(65 + i)}. {c}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
 };

/****************************
 * 元件：獎章區
 ****************************/
 const BADGE_META: Record<string, { name: string; desc: string } > = {
  FIRST_STEPS: { name: "新手啟程", desc: "在任一單元標記過學習進度" },
  VOCAB_NOVICE: { name: "單字入門", desc: "單字小測達成 6 分以上" },
  GRAMMAR_APPRENTICE: { name: "文法學徒", desc: "完成一次重組句子遊戲" },
  STORY_EXPLORER: { name: "故事探險", desc: "閱讀任一課文一次" },
  SPEEDSTER: { name: "神速挑戰", desc: "挑戰區 40 秒內完成一次" },
  PERFECT_10: { name: "滿分王者", desc: "挑戰區拿到 10/10" },
  UNIT_MASTER: { name: "單元大師", desc: "任一單元星等達到 3 星" },
 };

 const BadgesView: React.FC<{ progress: Progress }>
  = ({ progress }) => (
  <Card>
    <SectionTitle title="獎章一覽" desc="依據學習/挑戰表現自動解鎖" />
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Object.entries(BADGE_META).map(([key, meta]) => {
        const unlocked = progress.badges[key]?.unlocked;
        return (
          <div key={key} className={`p-3 rounded-2xl border ${unlocked ? "bg-white" : "bg-neutral-100 opacity-80"}`}>
            <div className="text-2xl">{unlocked ? "🏅" : "🔒"}</div>
            <div className="font-semibold mt-1">{meta.name}</div>
            <div className="text-sm text-neutral-600">{meta.desc}</div>
            {unlocked && progress.badges[key]?.unlockedAt && (
              <div className="text-xs text-neutral-400 mt-1">解鎖於 {new Date(progress.badges[key]!.unlockedAt!).toLocaleString()}</div>
            )}
          </div>
        );
      })}
    </div>
  </Card>
 );

/****************************
 * 主 App
 ****************************/
 export default function LearningQuestApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const unit = UNITS.find(u => u.id === state.unit)!;

  // 啟動載入
  useEffect(() => {
    const restored = restore();
    if (restored) dispatch({ type: "LOAD", state: restored });
  }, []);

  const uProg = state.progress.byUnit[state.unit];

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50 text-neutral-900">
      <header className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold tracking-tight">LearningQuest</div>
          <div className="text-sm text-neutral-500">可模組化英語學習 · 6 單元 · 遊戲化</div>
        </div>
        <div className="flex items-center gap-2">
          <TabButton active={state.tab === "learn"} onClick={() => dispatch({ type: "SET_TAB", tab: "learn" })}>學習區</TabButton>
          <TabButton active={state.tab === "challenge"} onClick={() => dispatch({ type: "SET_TAB", tab: "challenge" })}>挑戰區</TabButton>
          <TabButton active={state.tab === "badges"} onClick={() => dispatch({ type: "SET_TAB", tab: "badges" })}>獎章區</TabButton>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-10">
        {/* HUD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card>
            <div className="text-sm text-neutral-500">目前單元</div>
            <div className="text-lg font-semibold">{unit.title}</div>
            <div className="mt-2 text-sm">星等：{"⭐".repeat(uProg.stars)}{"☆".repeat(3 - uProg.stars)}</div>
          </Card>
          <Card>
            <div className="text-sm text-neutral-500">本單元 XP</div>
            <div className="text-2xl font-bold">{uProg.xp}</div>
            <div className="text-sm text-neutral-500">總 XP：{state.progress.totalXP}</div>
          </Card>
          <Card>
            <div className="text-sm text-neutral-500">快捷</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { localStorage.removeItem(STORAGE_KEY); location.reload(); }} className="px-3 py-2 rounded-xl border text-sm">重置進度</button>
              <button onClick={() => alert("請在 UNITS 常數中替換成你的題庫即可擴充 6 單元。")} className="px-3 py-2 rounded-xl border text-sm">如何擴充？</button>
            </div>
          </Card>
        </div>

        {/* 單元選擇 */}
        <Card>
          <SectionTitle title="選擇單元 (共 6)" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {UNITS.map(u => (
              <button key={u.id} onClick={() => dispatch({ type: "SET_UNIT", unit: u.id })}
                className={`p-3 rounded-xl border text-left ${u.id === state.unit ? "bg-neutral-900 text-white border-neutral-900" : "bg-white hover:bg-neutral-50"}`}>
                <div className="text-xs opacity-80">Unit {u.id}</div>
                <div className="font-semibold truncate">{u.title.replace(/^Unit \d+:\s*/, "")}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* 主區域 */}
        <div className="mt-4 space-y-4">
          {state.tab === "learn" && (
            <>
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <TabButton active={state.learnSubTab === "vocab"} onClick={() => dispatch({ type: "SET_LEARN_SUBTAB", sub: "vocab" })}>1. 單字</TabButton>
                  <TabButton active={state.learnSubTab === "grammar"} onClick={() => dispatch({ type: "SET_LEARN_SUBTAB", sub: "grammar" })}>2. 文法</TabButton>
                  <TabButton active={state.learnSubTab === "text"} onClick={() => dispatch({ type: "SET_LEARN_SUBTAB", sub: "text" })}>3. 課文</TabButton>
                </div>
                {/* 子頁籤內視圖選擇 */}
                {state.learnSubTab === "vocab" && (
                  <div className="flex items-center gap-2">
                    <TabButton active={state.vocabView === "set"} onClick={() => dispatch({ type: "SET_VOCAB_VIEW", view: "set" })}>單字集</TabButton>
                    <TabButton active={state.vocabView === "quiz"} onClick={() => dispatch({ type: "SET_VOCAB_VIEW", view: "quiz" })}>4 選 1 小遊戲</TabButton>
                  </div>
                )}
                {state.learnSubTab === "grammar" && (
                  <div className="flex items-center gap-2">
                    <TabButton active={state.grammarView === "explain"} onClick={() => dispatch({ type: "SET_GRAMMAR_VIEW", view: "explain" })}>文法說明</TabButton>
                    <TabButton active={state.grammarView === "reorder"} onClick={() => dispatch({ type: "SET_GRAMMAR_VIEW", view: "reorder" })}>重組句子</TabButton>
                  </div>
                )}
                {state.learnSubTab === "text" && (
                  <div className="flex items-center gap-2">
                    <TabButton active={state.textView === "story"} onClick={() => dispatch({ type: "SET_TEXT_VIEW", view: "story" })}>課文故事</TabButton>
                    <TabButton active={state.textView === "arrange"} onClick={() => dispatch({ type: "SET_TEXT_VIEW", view: "arrange" })}>句型排列</TabButton>
                  </div>
                )}
              </Card>

              {/* 內容區塊 */}
              {state.learnSubTab === "vocab" && (
                state.vocabView === "set" ? (
                  <VocabSet unit={unit} onStudied={() => { dispatch({ type: "ADD_XP", unit: state.unit, amount: 5 }); dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { vocab: { ...uProg.vocab, studied: uProg.vocab.studied + 1 } } }); }} />
                ) : (
                  <VocabQuiz unit={unit} onFinished={(score) => {
                    dispatch({ type: "ADD_XP", unit: state.unit, amount: score });
                    dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { vocab: { ...uProg.vocab, quizBest: Math.max(uProg.vocab.quizBest, score) } } });
                  }} />
                )
              )}

              {state.learnSubTab === "grammar" && (
                state.grammarView === "explain" ? (
                  <GrammarExplain unit={unit} onStudied={() => { dispatch({ type: "ADD_XP", unit: state.unit, amount: 5 }); dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { grammar: { ...uProg.grammar, studied: uProg.grammar.studied + 1 } } }); }} />
                ) : (
                  <ReorderSentenceGame target={unit.grammar[0]?.examples[0] ?? "I am a student."} onFinished={(ok) => {
                    dispatch({ type: "ADD_XP", unit: state.unit, amount: ok ? 5 : 2 });
                    dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { grammar: { ...uProg.grammar, reorderBest: Math.max(uProg.grammar.reorderBest, ok ? 1 : 0) } } });
                  }} />
                )
              )}

              {state.learnSubTab === "text" && (
                state.textView === "story" ? (
                  <StoryViewer story={unit.story} onRead={() => { dispatch({ type: "ADD_XP", unit: state.unit, amount: 5 }); dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { text: { ...uProg.text, read: uProg.text.read + 1 } } }); }} />
                ) : (
                  <ArrangeSentencesGame sentences={unit.story.sentencesForArrange} onFinished={(correct) => {
                    dispatch({ type: "ADD_XP", unit: state.unit, amount: correct });
                    dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { text: { ...uProg.text, arrangeBest: Math.max(uProg.text.arrangeBest, correct) } } });
                  }} />
                )
              )}
            </>
          )}

          {state.tab === "challenge" && (
            <ChallengeRun unit={unit} onFinish={(score, timeUsed) => {
              const bestScore = Math.max(uProg.challenge.bestScore, score);
              const bestTime = uProg.challenge.bestTimeSec === 0 ? timeUsed : Math.min(uProg.challenge.bestTimeSec, timeUsed);
              dispatch({ type: "ADD_XP", unit: state.unit, amount: score * 2 });
              dispatch({ type: "UPDATE_PROGRESS", unit: state.unit, patch: { challenge: { clearedLevels: uProg.challenge.clearedLevels + 1, bestTimeSec: bestTime, bestScore } } });
              if (score === 10) dispatch({ type: "AWARD_BADGE", key: "PERFECT_10" });
              if (timeUsed <= 40) dispatch({ type: "AWARD_BADGE", key: "SPEEDSTER" });
              alert(`挑戰完成！\n得分：${score}/10\n用時：${timeUsed}s`);
            }} />
          )}

          {state.tab === "badges" && (
            <BadgesView progress={state.progress} />
          )}
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-8 text-center text-sm text-neutral-500">
        © {new Date().getFullYear()} LearningQuest · 可自由調整的模組化原型
      </footer>
    </div>
  );
 }
