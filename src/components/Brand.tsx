export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" stroke="#0b6b4f" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="8.5" stroke="#0b6b4f" strokeWidth="2.2" opacity="0.55" />
      <circle cx="16" cy="16" r="3.4" fill="#0b6b4f" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <LogoMark />
      cible
    </span>
  );
}
