// src/lib/questionGen.ts
import type { MCQ, UnitConfig } from "../types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function makeVocabMCQ(unit: UnitConfig, count = 10): MCQ[] {
  const all = (unit.words ?? []).filter(w => w?.term?.trim() && w?.def?.trim());
  if (all.length === 0) return [];

  const pool = shuffle(all); // 先打散整池
  const take = Math.min(count, pool.length);
  const qs: MCQ[] = [];

  for (let i = 0; i < take; i++) {
    const correct = pool[i];

    // 取 3 個非正解的干擾；不足則從全池補
    const others = all.filter(w => w.term !== correct.term);
    let distract = shuffle(others).slice(0, 3).map(w => w.term);

    // 題庫太小時補到 3 個
    let k = 0;
    while (distract.length < 3 && all.length > 1 && k < all.length * 2) {
      const extra = all[(Math.random() * all.length) | 0].term;
      if (extra !== correct.term && !distract.includes(extra)) distract.push(extra);
      k++;
    }

    const choices = shuffle([correct.term, ...distract].slice(0, 4));
    qs.push({
      id: `v-${unit.id}-${i}-${uid()}`,
      prompt: `「${correct.def}」的英文是哪一個？`,
      choices,
      correctIndex: choices.indexOf(correct.term),
      tag: "vocab",
      // 不放 explain，VocabQuiz 只在有 explain 時才顯示提示
    });
  }

  return qs;
}


export function makeBeVerbMCQ(unit: UnitConfig, count = 5): MCQ[] {
  const samples = [
    { s: "I __ a student.", c: "am" },
    { s: "She __ a teacher.", c: "is" },
    { s: "They __ friends.", c: "are" },
    { s: "He __ my brother.", c: "is" },
    { s: "We __ in the library.", c: "are" },
  ];
  const forms = ["am", "is", "are", "be"];
  const qs: MCQ[] = samples.slice(0, count).map((it, i) => {
    const choices = shuffle(
      Array.from(new Set([it.c, ...shuffle(forms).slice(0, 3)]))
    ).slice(0, 4);
    return {
      id: `g-${unit.id}-${i}-${uid()}`,
      prompt: it.s,
      choices,
      correctIndex: choices.indexOf(it.c),
      explain: "主詞與 be 動詞一致：I→am, he/she/it→is, you/we/they→are。",
      tag: "grammar",
    };
  });
  return shuffle(qs);
}

export function makeStoryOrderMCQ(unit: UnitConfig, count = 3): MCQ[] {
  const sents = unit.story.sentencesForArrange;
  const qs: MCQ[] = [];
  const orders = [0, 1, 2];
  for (const k of orders.slice(0, Math.min(count, sents.length))) {
    const correct = sents[k];
    const choices = shuffle([
      correct,
      ...shuffle(sents.filter((_, i) => i !== k)).slice(0, 3),
    ]);
    qs.push({
      id: `t-${unit.id}-${k}-${uid()}`,
      prompt: `故事中第 ${k + 1} 句是？`,
      choices,
      correctIndex: choices.indexOf(correct),
      explain: "檢查段落順序理解。",
      tag: "text",
    });
  }
  return shuffle(qs);
}

export function makeChallengeSet(unit: UnitConfig, total = 10): MCQ[] {
  const mix = [
    ...makeVocabMCQ(unit, Math.min(5, total)),
    ...makeBeVerbMCQ(unit, Math.min(3, total)),
    ...makeStoryOrderMCQ(unit, Math.min(2, total)),
  ];
  return shuffle(mix).slice(0, total);
}
