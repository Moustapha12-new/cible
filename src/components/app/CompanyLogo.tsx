import React from "react";

interface CompanyLogoProps {
  company: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CompanyLogo({ company, size = "md", className = "" }: CompanyLogoProps) {
  const norm = company.toLowerCase().trim();

  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-xs",
    lg: "w-11 h-11 text-sm",
  }[size];

  // Specific SVGs matching the visual references
  if (norm.includes("edf")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-orange-50 border border-orange-100/80 shrink-0 ${sizeClasses} ${className}`}
        aria-label="EDF"
      >
        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
          <circle cx="16" cy="16" r="3.5" fill="#f97316" />
          <path
            d="M16 4C14.5 9 17.5 13 16 16C14.5 13 17.5 9 16 4Z"
            fill="#ea580c"
          />
          <path
            d="M28 16C23 14.5 19 17.5 16 16C19 14.5 23 17.5 28 16Z"
            fill="#f97316"
          />
          <path
            d="M16 28C17.5 23 14.5 19 16 16C17.5 19 14.5 23 16 28Z"
            fill="#fb923c"
          />
          <path
            d="M4 16C9 17.5 13 14.5 16 16C13 17.5 9 14.5 4 16Z"
            fill="#ea580c"
          />
          <path
            d="M7.5 7.5C11 11 13 13 16 16C13 13 11 11 7.5 7.5Z"
            stroke="#f97316"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M24.5 24.5C21 21 19 19 16 16C19 19 21 21 24.5 24.5Z"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (norm.includes("rte")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-[#0284c7] text-white font-bold tracking-tight shrink-0 ${sizeClasses} ${className}`}
        aria-label="RTE"
      >
        <span className="font-extrabold text-[11px] lowercase tracking-tighter">rte</span>
      </div>
    );
  }

  if (norm.includes("engie")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-blue-50 border border-blue-100 shrink-0 ${sizeClasses} ${className}`}
        aria-label="Engie"
      >
        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
          <path
            d="M6 22C11 12 21 10 26 12C20 14 15 18 10 24C8 24 6.5 23.5 6 22Z"
            fill="#0284c7"
          />
          <path
            d="M10 24C16 16 24 15 27 18C22 19 17 23 13 25"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (norm.includes("schneider")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 shrink-0 ${sizeClasses} ${className}`}
        aria-label="Schneider Electric"
      >
        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
          <rect x="5" y="7" width="22" height="18" rx="4" fill="#16a34a" />
          <path
            d="M11 16H21M16 11V21"
            stroke="#ffffff"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="16" cy="16" r="2.5" fill="#22c55e" />
        </svg>
      </div>
    );
  }

  if (norm.includes("total")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-red-50 border border-red-100 shrink-0 ${sizeClasses} ${className}`}
        aria-label="TotalEnergies"
      >
        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
          <path
            d="M7 16C7 11 11 7 16 7C20 7 23 9.5 24.5 13"
            stroke="#ef4444"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M25 16C25 21 21 25 16 25C12 25 9 22.5 7.5 19"
            stroke="#3b82f6"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M16 7C19.5 9 22 12 22 16"
            stroke="#f59e0b"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (norm.includes("enedis")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-sky-50 border border-sky-100 shrink-0 ${sizeClasses} ${className}`}
        aria-label="Enedis"
      >
        <div className="flex flex-col items-center justify-center font-bold text-[#0284c7] text-[10px] leading-none">
          <span>ENE</span>
          <span className="text-[#84cc16] text-[8px]">DIS</span>
        </div>
      </div>
    );
  }

  if (norm.includes("alstom")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-blue-900 text-white font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="Alstom"
      >
        <span className="text-[9px] font-black tracking-wider">ALS</span>
      </div>
    );
  }

  if (norm.includes("siemens")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-teal-700 text-white font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="Siemens"
      >
        <span className="text-[9px] font-extrabold tracking-wider">SIE</span>
      </div>
    );
  }

  if (norm.includes("vinci")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-700 font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="VINCI Energies"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <path d="M12 2L4 7V17L12 22L20 17V7L12 2ZM6 8.3L11 5.2V11.2L6 8.3ZM13 5.2L18 8.3L13 11.2V5.2ZM6 10.7L11 13.6V19.7L6 16.6V10.7ZM13 19.7V13.6L18 10.7V16.6L13 19.7Z" />
        </svg>
      </div>
    );
  }

  if (norm.includes("sncf")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-purple-100 text-purple-900 font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="SNCF Réseau"
      >
        <span className="text-[8px] font-black">SNCF</span>
      </div>
    );
  }

  if (norm.includes("airbus")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-slate-900 text-white font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="Airbus"
      >
        <span className="text-[11px] font-bold">A</span>
      </div>
    );
  }

  if (norm.includes("hager")) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-blue-600 text-white font-bold shrink-0 ${sizeClasses} ${className}`}
        aria-label="Hager"
      >
        <span className="text-[11px] font-bold">H</span>
      </div>
    );
  }

  // Fallback initials
  const initials = company
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "CI";

  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 font-bold border border-slate-200/80 shrink-0 ${sizeClasses} ${className}`}
      aria-label={company}
    >
      <span className="text-[10px] font-semibold">{initials}</span>
    </div>
  );
}
