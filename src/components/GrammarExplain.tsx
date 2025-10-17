import type { GrammarPoint } from "../types";
import { Card, SectionTitle } from "./ui";


type Props = { points: GrammarPoint[]; onStudied: () => void };


export default function GrammarExplain({ points, onStudied }: Props) {
return (
<Card>
<SectionTitle title="文法說明" />
<div className="space-y-4">
{points.map((g, i) => (
<div key={i} className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
<div className="font-semibold">{g.point}</div>
<div className="text-sm text-neutral-600 mt-1">{g.desc}</div>
<ul className="list-disc pl-6 text-sm mt-2 space-y-1">
{g.examples.map((e, j) => (<li key={j}>{e}</li>))}
</ul>
</div>
))}
</div>
<button onClick={onStudied} className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm mt-4">標記為已研讀</button>
</Card>
);
}