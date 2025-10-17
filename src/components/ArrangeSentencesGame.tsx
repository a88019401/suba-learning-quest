import { useMemo, useState } from "react";
import { Card, SectionTitle } from "./ui";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Props = { sentences: string[]; onFinished: (score: number) => void };
type Row = { id: string; text: string };

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function SortableRow({
  item,
  index,
  correct,
}: {
  item: Row;
  index: number;
  correct: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
  };

  const colorBox = correct
    ? "border-green-400 bg-green-50 text-green-900"
    : "border-red-300 bg-red-50 text-red-800";

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 cursor-grab select-none ${
        isDragging ? "opacity-70" : ""
      }`}
      aria-roledescription="sortable item"
    >
      <div className={`flex-1 p-3 rounded-xl border transition-all duration-150 ${colorBox}`}>
        <div className="flex items-center gap-2">
          <span className="text-neutral-500" aria-hidden>≡</span>
          <span
            className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold ${
              correct ? "bg-green-600 text-white" : "bg-red-600 text-white"
            }`}
            aria-label={correct ? "正確" : "錯誤"}
            title={correct ? "正確" : "錯誤"}
          >
            {correct ? "✓" : "✗"}
          </span>
          <span className="opacity-70">{index + 1}.</span>
          <span>{item.text}</span>
        </div>
      </div>
    </li>
  );
}

export default function ArrangeSentencesGame({ sentences, onFinished }: Props) {
  // 10 題制：若故事超過 10 句，僅取前 10 句計分
  const total = useMemo(() => Math.min(10, sentences.length), [sentences.length]);
  const target = useMemo(() => sentences.slice(0, total), [sentences, total]);
  const targetRows = useMemo<Row[]>(
    () => target.map((text, idx) => ({ id: `s-${idx}`, text })),
    [target]
  );

  const [list, setList] = useState<Row[]>(() => fisherYates(targetRows));
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [reveal, setReveal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const isCorrectAt = (idx: number) => list[idx]?.text === target[idx];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setList((prev) => {
      const oldIndex = prev.findIndex((x) => x.id === String(active.id));
      const newIndex = prev.findIndex((x) => x.id === String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const finish = () => {
    const correct = list.filter((r, i) => r.text === target[i]).length;
    setScore(correct);
    setDone(true);
    onFinished(correct); // 回傳 0~10
  };

  const reset = () => {
    setList(fisherYates(targetRows));
    setDone(false);
    setScore(0);
    setReveal(false);
  };

  const showAnswer = () => {
    setList(targetRows); // 直接還原成答案順序
    setReveal(true);
  };

  const passed = score >= Math.ceil(total * 0.7); // 7/10 過關

  // —— 結果畫面 —— //
  if (done) {
    return (
      <Card>
        <div className={`flex items-center gap-3 mb-3 ${passed ? "text-green-700" : "text-amber-700"}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${passed ? "bg-green-100" : "bg-amber-100"}`}>
            {passed ? "✓" : "!"}
          </div>
          <SectionTitle title={passed ? "恭喜通關！" : "再接再厲！"} desc={`得分：${score} / ${total}`} />
        </div>

        <div className="p-4 rounded-xl border bg-white">
          <div className="text-sm text-neutral-600">
            {passed ? "句型掌握不錯！想挑戰更高分嗎？" : "差一點點就過關了，調整幾句就好！"}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={reset} className="px-4 py-2 rounded-xl border bg-neutral-900 text-white hover:opacity-90">
              再來一次
            </button>
            {!reveal && (
              <button onClick={showAnswer} className="px-4 py-2 rounded-xl border">
                顯示答案
              </button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // —— 排序畫面 —— //
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle
          title="句型排列小遊戲（拖曳排序｜手機/電腦支援）"
          desc={`將句子排成正確順序：正確亮綠、錯誤亮紅（可得分：0~${total}）`}
        />
        <div className="text-sm text-neutral-500">
          目標：至少 {Math.ceil(total * 0.7)} 句正確 ✓
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {list.map((row, i) => (
              <SortableRow key={row.id} item={row} index={i} correct={isCorrectAt(i)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="mt-3 flex gap-2">
        <button
          onClick={finish}
          className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm"
        >
          完成並計分
        </button>
        <button
          onClick={() => setList(fisherYates(list))}
          className="px-4 py-2 rounded-xl border text-sm"
          title="隨機重排目前列表（不重置）"
        >
          打亂一下
        </button>
      </div>
    </Card>
  );
}
