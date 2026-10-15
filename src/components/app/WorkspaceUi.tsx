"use client";

import { LayoutGrid, List, type LucideIcon } from "lucide-react";

export function ViewSwitch({ value, onChange }: { value: "list" | "cards"; onChange: (value: "list" | "cards") => void }) {
  return <div className="workspace-view-switch" role="group" aria-label="Mode d’affichage">
    <button type="button" aria-pressed={value === "list"} onClick={() => onChange("list")}><List size={15} /> Liste</button>
    <button type="button" aria-pressed={value === "cards"} onClick={() => onChange("cards")}><LayoutGrid size={15} /> Cartes</button>
  </div>;
}

export function MetricCard({ label, value, caption, icon: Icon, tone = "blue" }: { label: string; value: number; caption: string; icon: LucideIcon; tone?: "blue" | "green" | "amber" | "rose" }) {
  return <div className={`glass-card workspace-metric metric-${tone}`}><span className="metric-icon"><Icon size={22} /></span><div><span>{label}</span><strong>{value}</strong><small>{caption}</small></div></div>;
}

/** Decorative illustration, independent of the user's account data. */
export function MountainScene() {
  return <svg className="workspace-mountains" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="cible-sky" x2="0" y2="1"><stop stopColor="#13294c" /><stop offset=".68" stopColor="#cb8da0" /><stop offset="1" stopColor="#ffd0b1" /></linearGradient></defs>
    <path fill="url(#cible-sky)" d="M0 0h600v240H0z" /><circle cx="455" cy="104" r="28" fill="#ffe0c4" opacity=".65" />
    <path fill="#5e608b" d="m0 163 64-46 43 18 77-75 70 58 50-23 83 65 80-86 59 57 74-34v143H0z" />
    <path fill="#a6a4bd" d="m184 60-35 57 36-18 35 21zM467 74l-30 49 31-19 30 27z" />
    <path fill="#243c60" d="m0 174 89-45 43 37 72-35 65 42 81-60 79 77 92-42 79 33v59H0z" />
    <path fill="#08172f" d="m0 208 72-26 85 32 114-25 64 27 115-34 150 30v28H0z" />
  </svg>;
}
