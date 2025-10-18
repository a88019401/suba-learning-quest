import React, { useMemo, useRef, useState, useEffect } from "react";
import { Card, SectionTitle } from "./ui";
import {
   DndContext,
   MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { supabase } from "../supabaseClient"; 
import { useAuth } from "../state/AuthContext"; 
/* =========================
   Types
   ========================= */
type Props = { targets: string[]; onFinished: (score: number) => void };

type Cell = 0 | 1;
type Board = Cell[][];
type Piece = {
  id: string;
  cells: Array<[number, number]>;
  w: number;
  h: number;
};

type GameOverReason = "wrong-limit" | "no-fit" | "completed";

const GRID = 10;
const WRONG_LIMIT = 3;
const STORAGE_KEY = "lq:grammar-tetris:logs";

/* =========================
   Utils
   ========================= */
// 把句子切成詞與標點：Hello, world! → ["Hello", ",", "world", "!"]
function tokenize(sentence: string): string[] {
  const s = sentence.trim().replace(/\s+/g, " ");
  const tokens = s.match(/[\w’']+|[^\s]/g); // 單字(含 ' ’) 或任何非空白字元（標點）
  return tokens ?? [s];
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* =========================
   靜態俄羅斯方塊（1010! 規則）
   ========================= */
const TETROMINOES: Record<string, Array<[number, number]>> = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  O: [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  J: [
    [1, 0],
    [1, 1],
    [1, 2],
    [0, 2],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
};
function rotate90(cells: Array<[number, number]>): Array<[number, number]> {
  // (x, y) -> (y, -x) 之後正規化
  const rotated = cells.map(([x, y]) => [y, -x] as [number, number]);
  const minX = Math.min(...rotated.map(([x]) => x));
  const minY = Math.min(...rotated.map(([, y]) => y));
  return rotated.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}
function normalize(cells: Array<[number, number]>): {
  cells: Array<[number, number]>;
  w: number;
  h: number;
} {
  const maxX = Math.max(...cells.map(([x]) => x));
  const maxY = Math.max(...cells.map(([, y]) => y));
  return { cells, w: maxX + 1, h: maxY + 1 };
}
function makeRandomPiece(): Piece {
  const keys = Object.keys(TETROMINOES);
  const k = keys[Math.floor(Math.random() * keys.length)];
  let cells = TETROMINOES[k];
  const rot = Math.floor(Math.random() * 4);
  for (let i = 0; i < rot; i++) cells = rotate90(cells);
  const norm = normalize(cells);
  return {
    id: "P-" + Math.random().toString(36).slice(2, 8),
    cells: norm.cells,
    w: norm.w,
    h: norm.h,
  };
}
function emptyBoard(): Board {
  return Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => 0 as Cell)
  );
}

/* =========================
   Fit/Place Helpers
   ========================= */
function canPlaceOn(board: Board, piece: Piece, r: number, c: number): boolean {
  return piece.cells.every(([x, y]) => {
    const rr = r + y,
      cc = c + x;
    return rr >= 0 && rr < GRID && cc >= 0 && cc < GRID && board[rr][cc] === 0;
  });
}
function hasAnyPlacement(board: Board, pieces: Piece[]): boolean {
  for (const p of pieces) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (canPlaceOn(board, p, r, c)) return true;
      }
    }
  }
  return false;
}

/* =========================
   DnD Cells & Pieces
   ========================= */
const DroppableCell: React.FC<{
  id: string;
  filled: boolean;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ id, filled, disabled, onClick }) => {
  const { setNodeRef } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      onClick={disabled ? undefined : onClick}
      className={
        "w-7 h-7 border rounded-md " +
        (filled
          ? "bg-neutral-900 border-neutral-900"
          : "bg-white border-neutral-200") +
        (disabled
          ? " opacity-40 pointer-events-none"
          : " hover:bg-neutral-100 cursor-pointer")
      }
      style={{ touchAction: "none" }}
      aria-label={filled ? "filled" : "empty"}
    />
  );
};

const DraggablePiece: React.FC<{
  piece: Piece;
  disabled?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}> = ({ piece, disabled, selected, onSelect }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: piece.id, disabled });
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={disabled ? undefined : onSelect}
      className={
        "inline-block p-2 rounded-2xl border bg-white shadow-sm select-none " +
        (disabled ? "opacity-40 cursor-not-allowed " : "cursor-grab ") +
        (selected ? "ring-2 ring-neutral-900 " : "") +
        (isDragging ? "opacity-70 " : "")
      }
      aria-roledescription="draggable-piece"
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        touchAction: "none",
      }}
    >
      <div
        className="grid auto-rows-max gap-0.5"
        style={{ gridTemplateColumns: `repeat(${piece.w}, 1.75rem)` }}
      >
        {Array.from({ length: piece.h }).map((_, r) =>
          Array.from({ length: piece.w }).map((_, c) => {
            const on = piece.cells.some(([x, y]) => x === c && y === r);
            return (
              <div
                key={r + "-" + c}
                className={
                  "w-7 h-7 rounded-md " +
                  (on ? "bg-neutral-900" : "bg-neutral-200")
                }
              />
            );
          })
        )}
      </div>
    </button>
  );
};

/* =========================
   Main Component
   ========================= */
export default function ReorderSentenceGame({ targets, onFinished }: Props) {
  const { user, profile } = useAuth();
  /** ===== 句庫與回合 ===== */
  const roundsRef = useRef<string[] | null>(null);
  if (!roundsRef.current) {
    roundsRef.current = shuffle(targets);
  }
  const rounds = roundsRef.current!; // 固定本輪題庫
  const total = rounds.length;
  const [roundIdx, setRoundIdx] = useState(0);

  /** ===== 文法作答狀態 ===== */
  const current = rounds[roundIdx] ?? "";
  const answerTokens = useMemo(() => tokenize(current), [current]);
  const [tray, setTray] = useState<string[]>(() => {
    let shuffled = shuffle(answerTokens);
    if (shuffled.join("|") === answerTokens.join("|"))
      shuffled = shuffle(answerTokens);
    return shuffled;
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [checked, setChecked] = useState<null | boolean>(null); // null: 未繳交, true/false: 判定結果
  const [showKnowBtn, setShowKnowBtn] = useState(false); // 錯誤時顯示「知道了」

  /** ===== 棋盤 & 方塊 ===== */
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [bag, setBag] = useState<Piece[]>([]); // 每題正確才發三塊
  const [selected, setSelected] = useState<string | null>(null);

  /** ===== 計分與終止條件 ===== */
  const [linesCleared, setLinesCleared] = useState(0); // 總分：累積消除行／列數
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongItems, setWrongItems] = useState<
    Array<{ question: string; correct: string }>
  >([]);
  const [gameOver, setGameOver] = useState<null | { reason: GameOverReason }>(
    null
  );

  /** ===== DnD sensors（只宣告一次） ===== */
 const sensors = useSensors(
   // 滑鼠：拖動距離 5px 之後才啟動
   useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
   // 觸控：長按 120ms + 容忍位移 8px 之後才啟動，減少誤觸
   useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
 );

  /** ===== 階段：arrange（重組） or puzzle（方塊） ===== */
  const phase: "arrange" | "puzzle" =
    bag.length > 0 ? "puzzle" : checked === true ? "puzzle" : "arrange";

  /* =========================
     Board / Clear / Fit
     ========================= */
  function place(piece: Piece, r: number, c: number) {
    setBoard((prev) => {
      const next = prev.map((row) => [...row]);
      piece.cells.forEach(([x, y]) => {
        next[r + y][c + x] = 1;
      });
      return next;
    });

    // 消除，並累計分數（行/列數）
    setBoard((prev) => {
      let next = prev.map((row) => [...row]);
      const fullRows: number[] = [];
      const fullCols: number[] = [];
      for (let rr = 0; rr < GRID; rr++)
        if (next[rr].every((v) => v === 1)) fullRows.push(rr);
      for (let cc = 0; cc < GRID; cc++) {
        let ok = true;
        for (let rr = 0; rr < GRID; rr++)
          if (next[rr][cc] === 0) {
            ok = false;
            break;
          }
        if (ok) fullCols.push(cc);
      }
      const cleared = fullRows.length + fullCols.length;
      if (cleared > 0) {
        for (const rr of fullRows)
          next[rr] = Array.from({ length: GRID }, () => 0);
        for (const cc of fullCols)
          for (let rr = 0; rr < GRID; rr++) next[rr][cc] = 0;
        setLinesCleared((x) => x + cleared);
      }
      return next;
    });
  }

  function dealThreePiecesAndCheckFit() {
    const pieces = [makeRandomPiece(), makeRandomPiece(), makeRandomPiece()];
    setBag(pieces);
    setSelected(null);
    // 8/9：若完全無處可放，立即遊戲結束
    if (!hasAnyPlacement(board, pieces)) {
      endGame("no-fit");
    }
  }

  function afterPlacedUpdate(restCount: number) {
    if (restCount === 0) {
      // 三塊都放完 → 進下一題（若已是最後一題則完成）
      advanceToNextQuestion();
    } else {
      // 尚有方塊：偵測是否還能塞（8/9）
      const restPieces = bag.filter((p) =>
        restCount === bag.length ? true : p.id !== selected
      ); // 保守處理
      const piecesToCheck = restPieces.length ? restPieces : bag;
      if (!hasAnyPlacement(board, piecesToCheck)) {
        endGame("no-fit");
      }
    }
  }

  /* =========================
     DnD handlers
     ========================= */
  function onDragEnd(e: DragEndEvent) {
    if (!e.active || !e.over) return;
    const piece = bag.find((p) => p.id === e.active.id);
    if (!piece) return;
    const id = String(e.over.id);
    if (!id.startsWith("cell-")) return;
    const [r, c] = id.replace("cell-", "").split("-").map(Number);
    if (canPlaceOn(board, piece, r, c)) {
      place(piece, r, c);
      setBag((prev) => {
        const rest = prev.filter((p) => p.id !== piece.id);
        setTimeout(() => afterPlacedUpdate(rest.length), 50);
        return rest;
      });
      setSelected(null);
    }
  }
  function onCellClick(r: number, c: number) {
    if (!selected) return;
    const piece = bag.find((p) => p.id === selected);
    if (!piece) return;
    if (canPlaceOn(board, piece, r, c)) {
      place(piece, r, c);
      setBag((prev) => {
        const rest = prev.filter((p) => p.id !== selected);
        setTimeout(() => afterPlacedUpdate(rest.length), 50);
        return rest;
      });
      setSelected(null);
    }
  }

  /* =========================
     Grammar handlers
     ========================= */
  /*
  function reshuffleTokens() {
    // 只打亂字卡；不動棋盤
    setTray(() => {
      let shuffled = shuffle(answerTokens);
      if (shuffled.join("|") === answerTokens.join("|")) shuffled = shuffle(answerTokens);
      return shuffled;
    });
    setPicked([]);
    setChecked(null);
    setShowKnowBtn(false);
  }*/

  function pickToken(t: string, idx: number) {
    if (phase === "puzzle") return; // 解鎖後先完成放 3 塊
    setPicked((prev) => [...prev, t]);
    setTray((arr) => arr.filter((_, i) => i !== idx));
  }
  function unpickToken(idx: number) {
    if (phase === "puzzle") return;
    setTray((arr) => [...arr, picked[idx]]);
    setPicked((p) => p.filter((_, i) => i !== idx));
  }

  function submit() {
    if (phase === "puzzle") return;
    if (checked !== null) return;
    const ok =
      picked.length === answerTokens.length &&
      picked.every((t, i) => t === answerTokens[i]);
    setChecked(ok);
    if (ok) {
      // 3. 正確 → 發三塊，進入 puzzle 階段
      dealThreePiecesAndCheckFit();
    } else {
      // 5. 錯誤 → 紅色 UI + 立刻顯示正解 + 「知道了」按鈕
      setShowKnowBtn(true);
      setWrongCount((n) => {
        const next = n + 1;
        return next;
      });
      setWrongItems((list) => [
        ...list,
        { question: current, correct: answerTokens.join(" ") },
      ]);
    }
  }

  function knowAndNext() {
    // 若錯題達上限，立即結束（7）
    if (wrongCount >= WRONG_LIMIT) {
      endGame("wrong-limit");
      return;
    }
    // 否則進下一題
    advanceToNextQuestion();
  }

  /* =========================
     Round / End
     ========================= */
  function advanceToNextQuestion() {
    const isLast = roundIdx + 1 >= total;
    if (isLast) {
      endGame("completed");
      return;
    }
    const nextIdx = roundIdx + 1;
    setRoundIdx(nextIdx);
    const nextAns = tokenize(rounds[nextIdx] ?? "");
    let shuffled = shuffle(nextAns);
    if (shuffled.join("|") === nextAns.join("|")) shuffled = shuffle(nextAns);
    setTray(shuffled);
    setPicked([]);
    setChecked(null);
    setShowKnowBtn(false);
    setSelected(null);
    setBag([]); // 等下一題再正確才發 3 塊
  }

  function endGame(reason: GameOverReason) {
    if (gameOver) return; // 保險：避免重複收尾
    setGameOver({ reason });

    // 10. 可記錄的狀態（localStorage + CustomEvent）
    const report = {
      timestamp: new Date().toISOString(),
      roundsPlayed: roundIdx + 1,
      linesCleared,
      wrongCount,
      wrongItems,
      reason,
    };
    try {
      const arr: any[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      arr.push(report);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
    try {
      window.dispatchEvent(
        new CustomEvent("learning-quest:grammar-tetris-report", {
          detail: report,
        })
      );
    } catch {}

    // 回呼：用「消除行數」作為最終分數
    onFinished(linesCleared);
    // ✅ --- 新增上傳排行榜的邏輯 ---
    const uploadScore = async () => {
      if (!user || !profile?.full_name) return;

      try {
        const { error: upsertError } = await supabase
          .from('leaderboard')
          .upsert({
            user_id: user.id,
            full_name: profile.full_name,
            game: 'tetris', // 遊戲名稱設為 'tetris'
            score: linesCleared, // 分數是消除的行數
          }, {
            onConflict: 'user_id,game',
            ignoreDuplicates: false,
          });

        if (upsertError) throw upsertError;
        console.log('Successfully upserted leaderboard for tetris!');
      } catch (error) {
        console.error('Error updating tetris leaderboard:', error);
      }
    };

    uploadScore();
    // ✅ --- 結束 ---
  }

  /* =========================
     Reset board
     ========================= */
  /*function resetBoard() {
    setBoard(emptyBoard());
    // 不重置分數與錯題，純粹清盤
    // 若當前 bag 無可放置，下一次發牌（答對）還是會檢查終止條件
  }*/

  /* =========================
     Effects：錯題上限即終止
     ========================= */
  useEffect(() => {
    if (wrongCount >= WRONG_LIMIT && !gameOver) {
      endGame("wrong-limit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongCount]);

  /* =========================
     End Modal
     ========================= */
  const EndModal = gameOver ? (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white border shadow-lg p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-neutral-900 text-white flex items-center justify-center text-lg">
            ★
          </div>
          <div className="text-lg font-semibold">
            {gameOver.reason === "completed" && "本輪完成"}
            {gameOver.reason === "no-fit" && "遊戲結束（無可放置）"}
            {gameOver.reason === "wrong-limit" && "遊戲結束（錯題達上限）"}
          </div>
        </div>
        <div className="text-sm text-neutral-700">
          總共消除行／列：<b>{linesCleared}</b>
        </div>

        {wrongItems.length > 0 && (
          <div className="mt-3">
            <div className="text-sm font-medium mb-1">錯誤題目與正解：</div>
            <div className="max-h-64 overflow-auto space-y-2 pr-1">
              {wrongItems.map((w, i) => (
                <div key={i} className="p-2 rounded-xl border bg-neutral-50">
                  <div className="text-xs text-neutral-500">題目</div>
                  <div className="text-sm">{w.question}</div>
                  <div className="mt-1 text-xs text-neutral-500">正解</div>
                  <div className="text-sm font-medium">{w.correct}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={() => {
              // 重新開始：清盤、清錯題、保留同一題庫流程
              setRoundIdx(0);
              const firstAns = tokenize(rounds[0] ?? "");
              let shuffled = shuffle(firstAns);
              if (shuffled.join("|") === firstAns.join("|"))
                shuffled = shuffle(firstAns);
              setTray(shuffled);
              setPicked([]);
              setChecked(null);
              setShowKnowBtn(false);

              setBoard(emptyBoard());
              setBag([]);
              setSelected(null);

              setLinesCleared(0);
              setWrongCount(0);
              setWrongItems([]);
              setGameOver(null);
            }}
            className="px-4 py-2 rounded-xl bg-neutral-900 text-white hover:opacity-90"
          >
            重新開始
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* =========================
     UI Layout
     ========================= */
  return (
    <div className="flex flex-col gap-4">
      {/* ① 上方：方塊棋盤（主遊戲） */}
      <Card className="relative">
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionTitle
            title="方塊棋盤"
            desc="流程：1 排列句子 → 2 繳交 → 3 正確獲得三塊 → 4 放完三塊自動跳下一題。分數＝消除行／列數。錯三題或無可放置則結束。"
          />
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2 py-1 rounded-lg border bg-white">
              已消：<b>{linesCleared}</b>
            </span>
            <span className="px-2 py-1 rounded-lg border bg-white">
              錯題：
              <b>
                {wrongCount}/{WRONG_LIMIT}
              </b>
            </span>
          </div>
        </div>

        {/* 棋盤 + 托盤 */}
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 棋盤 */}
            <div className="relative p-3 rounded-2xl border" style={{ touchAction: "none" }}>
              {/* overlay：未解鎖時 */}
              {phase === "arrange" && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] rounded-2xl z-10 flex items-center justify-center">
                  <div className="px-3 py-2 rounded-xl border bg-white text-sm text-neutral-700">
                    先完成下方的「重組句子」並
                    <span className="font-semibold">繳交</span>，才會發三塊
                  </div>
                </div>
              )}
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${GRID}, 1.75rem)` }}
              >
                {Array.from({ length: GRID }).map((_, r) =>
                  Array.from({ length: GRID }).map((_, c) => {
                    const id = `cell-${r}-${c}`;
                    return (
                      <DroppableCell
                        key={id}
                        id={id}
                        filled={board[r][c] === 1}
                        disabled={phase === "arrange"}
                        onClick={() => onCellClick(r, c)}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* 托盤（一次 3 塊） */}
            <div className="flex-1">
              <div className="text-sm text-neutral-600 mb-2">
                可用方塊（一次三個，用完自動進下一題）：
              </div>
              <div className="flex flex-wrap gap-3">
                {bag.length === 0 && phase === "puzzle" && (
                  <span className="text-sm text-neutral-500">
                    （三塊已放置，將進入下一題…）
                  </span>
                )}
                {bag.map((p) => (
                  <DraggablePiece
                    key={p.id}
                    piece={p}
                    disabled={phase === "arrange"}
                    selected={selected === p.id}
                    onSelect={() =>
                      setSelected((sel) => (sel === p.id ? null : p.id))
                    }
                  />
                ))}
              </div>

              <div className="mt-3 flex items-center gap-2">
                {/*<button onClick={resetBoard} className="px-3 py-1.5 rounded-xl border">重置棋盤</button>*/}
                {selected && (
                  <span className="text-xs text-neutral-500">
                    已選取：點棋盤格放置；或拖曳到棋盤。
                  </span>
                )}
              </div>
            </div>
          </div>
        </DndContext>
      </Card>

      {/* ② 下方：文法任務（重組句子） */}
      <Card>
        <div className="flex items-center justify-between mb-2">
          <SectionTitle
            title={`重組句子 (${roundIdx + 1}/${total})`}
            desc="正確後才會進入上方方塊回合"
          />
          <div className="w-44 h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-2 bg-neutral-900 transition-all"
              style={{ width: `${(roundIdx / total) * 100}%` }}
            />
          </div>
        </div>

        <div className="text-xs text-neutral-500 mb-2">
          點選下方片段來排列；排好後按「繳交」。若錯誤會立即顯示正解並提供「知道了」。
        </div>

        {/* 已選答案區 */}
        <div
          className={
            "min-h-[56px] p-3 rounded-xl border " +
            (checked === null
              ? "bg-white border-neutral-200"
              : checked
              ? "bg-green-50 border-green-300"
              : "bg-red-50 border-red-300")
          }
        >
          {picked.length === 0 ? (
            <span className="text-neutral-400 text-sm">點選下方片段來組句</span>
          ) : (
            <div
              className={
                "flex flex-wrap gap-2 " +
                (phase === "puzzle" ? "opacity-50 pointer-events-none" : "")
              }
            >
              {picked.map((t, i) => (
                <button
                  key={`p-${i}-${t}-${i}`}
                  onClick={() => unpickToken(i)}
                  className="px-2 py-1 rounded-lg border bg-white hover:bg-neutral-50"
                  title="點擊以移回下方"
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* 5. 錯誤：立刻顯示正解 + 知道了 */}
          {checked === false && (
            <div className="mt-3 p-2 rounded-lg border bg-amber-50 border-amber-300">
              <div className="text-xs font-medium text-amber-800 mb-1">
                正確排序：
              </div>
              <div className="flex flex-wrap gap-2">
                {answerTokens.map((t, i) => (
                  <span
                    key={`sol-${i}-${t}-${i}`}
                    className="px-2 py-1 rounded-lg border bg-white"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {showKnowBtn && (
                <div className="mt-3">
                  <button
                    onClick={knowAndNext}
                    className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white hover:opacity-90"
                  >
                    知道了
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 候選片段區 */}
        <div className="mt-3 p-3 rounded-xl border bg-white border-neutral-200">
          <div
            className={
              "flex flex-wrap gap-2 " +
              (phase === "puzzle" ? "opacity-50 pointer-events-none" : "")
            }
          >
            {tray.map((t, i) => (
              <button
                key={`t-${i}-${t}-${i}`}
                onClick={() => pickToken(t, i)}
                className="px-2 py-1 rounded-lg border bg-white hover:bg-neutral-50"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* 操作列 */}
        <div className="mt-3 flex gap-2">
          {phase === "arrange" ? (
            <>
              <button
                onClick={submit}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-white hover:opacity-90"
              >
                繳交
              </button>
              {/*<button onClick={reshuffleTokens} className="px-4 py-2 rounded-xl border">
                打亂順序
              </button>*/}
            </>
          ) : (
            <button className="px-4 py-2 rounded-xl border" disabled>
              已解鎖方塊：請先完成上方 3 塊放置
            </button>
          )}
          <span className="ml-auto text-xs text-neutral-500">
            棋盤 10×10｜行／列消除｜無時間限制
          </span>
        </div>
      </Card>

      {EndModal}
    </div>
  );
}


