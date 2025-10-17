import React from "react";


export const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }>
= ({ active, onClick, children }) => (
<button onClick={onClick} className={`px-4 py-2 rounded-2xl text-sm font-medium border transition ${active ? "bg-neutral-900 text-white border-neutral-900" : "bg-white border-neutral-300 hover:bg-neutral-100"}`}>
{children}
</button>
);


export const Card: React.FC<{ children: React.ReactNode; className?: string }>
= ({ children, className }) => (
<div className={`rounded-2xl border border-neutral-200 bg-white shadow-sm p-4 ${className ?? ""}`}>{children}</div>
);


export const SectionTitle: React.FC<{ title: string; desc?: string }>
= ({ title, desc }) => (
<div className="mb-3">
<h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
{desc && <p className="text-sm text-neutral-500">{desc}</p>}
</div>
);