import React from "react";

export interface DocumentSheetProps {
  name: string;
  headline: string;
  contact: {
    location: string;
    email: string;
    phone: string;
  };
  experiences: {
    title: string;
    period: string;
    bullets: string[];
  }[];
  education: {
    degree: string;
    school: string;
    period: string;
    detail?: string;
  }[];
  skills: { name: string; highlighted?: boolean }[];
  projects: {
    title: string;
    period: string;
    description: string;
    highlighted?: boolean;
  }[];
  isAdapted?: boolean;
}

export function DocumentSheet({
  name,
  headline,
  contact,
  experiences,
  education,
  skills,
  projects,
  isAdapted = false,
}: DocumentSheetProps) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-3.5 text-[10.5px] text-slate-800 leading-snug flex flex-col gap-2 min-h-[350px] select-text">
      {/* Header */}
      <div className="text-center pb-2 border-b border-slate-100">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-slate-900">
          {name}
        </h2>
        <p className={`text-[9.5px] font-medium mt-0.5 ${isAdapted ? "text-emerald-700 font-semibold" : "text-slate-600"}`}>
          {headline}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[8.5px] text-slate-400 mt-0.5">
          <span>{contact.location}</span>
          <span>•</span>
          <span>{contact.email}</span>
          <span>•</span>
          <span>{contact.phone}</span>
        </div>
      </div>

      {/* Expériences */}
      <div>
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Expériences
        </h3>
        <div className="flex flex-col gap-1.5">
          {experiences.map((exp, idx) => (
            <div key={idx} className="flex flex-col">
              <div className="flex items-baseline justify-between">
                <strong className="text-[10px] font-bold text-slate-800">
                  {exp.title}
                </strong>
                <span className="text-[9px] text-slate-400 font-mono">
                  {exp.period}
                </span>
              </div>
              <ul className="text-[9.5px] text-slate-600 list-disc list-inside mt-0.5 space-y-0.5">
                {exp.bullets.map((b, bIdx) => (
                  <li key={bIdx} className="leading-tight">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Formation */}
      <div>
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
          Formation
        </h3>
        <div className="flex flex-col gap-1">
          {education.map((edu, idx) => (
            <div key={idx} className="flex flex-col">
              <div className="flex items-baseline justify-between">
                <strong className="text-[10px] font-bold text-slate-800">
                  {edu.degree}
                </strong>
                <span className="text-[9px] text-slate-400 font-mono">
                  {edu.period}
                </span>
              </div>
              <span className="text-[9.5px] text-slate-500">{edu.school}</span>
              {edu.detail && (
                <span className="text-[9px] text-slate-500 italic">
                  {edu.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Compétences */}
      <div>
        <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Compétences
        </h3>
        <div className="flex flex-wrap gap-1">
          {skills.map((skill, idx) => (
            <span
              key={idx}
              className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                skill.highlighted
                  ? "bg-emerald-100 text-emerald-800 font-semibold border border-emerald-300/80"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {skill.name}
            </span>
          ))}
        </div>
      </div>

      {/* Projets */}
      {projects.length > 0 && (
        <div>
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Projets
          </h3>
          <div className="flex flex-col gap-1">
            {projects.map((proj, idx) => (
              <div
                key={idx}
                className={`p-1 rounded ${
                  proj.highlighted ? "bg-emerald-50/80 border border-emerald-200/60" : ""
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <strong className="text-[9.5px] font-bold text-slate-800">
                    {proj.title}
                  </strong>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {proj.period}
                  </span>
                </div>
                <p className="text-[9px] text-slate-600 mt-0.5 leading-tight">
                  {proj.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
