import React from "react";

export function MountainSidebarScene() {
  return (
    <div className="relative w-full h-24 overflow-hidden rounded-xl border border-white/10 my-3">
      <svg
        viewBox="0 0 300 120"
        className="w-full h-full object-cover"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#081026" />
            <stop offset="40%" stopColor="#1a274e" />
            <stop offset="75%" stopColor="#7a4261" />
            <stop offset="95%" stopColor="#ea8974" />
            <stop offset="100%" stopColor="#f7c59f" />
          </linearGradient>
          <linearGradient id="mountainBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4a3760" />
            <stop offset="100%" stopColor="#191932" />
          </linearGradient>
          <linearGradient id="mountainMid" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2e2b52" />
            <stop offset="100%" stopColor="#121324" />
          </linearGradient>
          <linearGradient id="mountainFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#14172e" />
            <stop offset="100%" stopColor="#080a14" />
          </linearGradient>
        </defs>

        {/* Sky background */}
        <rect width="300" height="120" fill="url(#skyGrad)" />

        {/* Stars */}
        <circle cx="25" cy="15" r="0.75" fill="#fff" opacity="0.8" />
        <circle cx="70" cy="28" r="0.6" fill="#fff" opacity="0.7" />
        <circle cx="120" cy="12" r="0.8" fill="#fff" opacity="0.9" />
        <circle cx="180" cy="22" r="0.7" fill="#fff" opacity="0.8" />
        <circle cx="230" cy="16" r="0.6" fill="#fff" opacity="0.7" />
        <circle cx="280" cy="30" r="0.75" fill="#fff" opacity="0.9" />

        {/* Distant peaks with snow/glow */}
        <polygon points="40,120 90,65 140,120" fill="url(#mountainBack)" opacity="0.85" />
        <polygon points="90,65 105,80 90,83 80,75" fill="#fbcfe8" opacity="0.3" />

        <polygon points="110,120 185,55 260,120" fill="url(#mountainBack)" opacity="0.9" />
        <polygon points="185,55 200,72 185,76 172,67" fill="#fed7aa" opacity="0.4" />

        {/* Mid peaks */}
        <polygon points="-20,120 50,75 130,120" fill="url(#mountainMid)" />
        <polygon points="130,120 220,68 310,120" fill="url(#mountainMid)" />

        {/* Front silhouette peaks */}
        <polygon points="20,120 100,85 180,120" fill="url(#mountainFront)" />
        <polygon points="160,120 240,82 320,120" fill="url(#mountainFront)" />
        <polygon points="-10,120 40,92 110,120" fill="url(#mountainFront)" />
      </svg>
    </div>
  );
}

export function HikerBannerScene() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      <svg
        viewBox="0 0 600 300"
        className="w-full h-full object-cover"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="bannerSky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0b1730" />
            <stop offset="50%" stopColor="#252c54" />
            <stop offset="78%" stopColor="#69405d" />
            <stop offset="92%" stopColor="#c56d64" />
            <stop offset="100%" stopColor="#f3b890" />
          </linearGradient>
          <linearGradient id="bannerBackPeaks" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#533c63" />
            <stop offset="100%" stopColor="#1b1d36" />
          </linearGradient>
          <linearGradient id="bannerFrontPeak" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#16182c" />
            <stop offset="100%" stopColor="#090a14" />
          </linearGradient>
        </defs>

        <rect width="600" height="300" fill="url(#bannerSky)" />

        {/* Distant mountain layer */}
        <polygon points="0,300 120,180 250,300" fill="url(#bannerBackPeaks)" opacity="0.6" />
        <polygon points="180,300 350,150 520,300" fill="url(#bannerBackPeaks)" opacity="0.75" />
        <polygon points="400,300 530,170 650,300" fill="url(#bannerBackPeaks)" opacity="0.6" />

        {/* Hiker standing on cliff edge in center/right */}
        {/* Cliff */}
        <path
          d="M 280,300 L 360,210 Q 380,205 400,210 L 460,300 Z"
          fill="url(#bannerFrontPeak)"
        />
        {/* Hiker silhouette */}
        <g fill="#070913" transform="translate(378, 172) scale(0.65)">
          {/* Head */}
          <circle cx="15" cy="8" r="4.5" />
          {/* Torso & Backpack */}
          <path d="M 11,13 C 10,17 9,25 9,32 L 20,32 C 20,25 19,17 18,13 Z" />
          <path d="M 6,15 C 4,18 4,24 6,28 C 8,29 10,28 10,26 L 10,16 Z" />
          {/* Legs */}
          <path d="M 11,32 L 8,50 L 12,51 L 14,35 L 17,35 L 19,50 L 23,49 L 20,32 Z" />
        </g>
      </svg>
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-slate-950/40" />
    </div>
  );
}
