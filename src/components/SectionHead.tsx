import type { ReactNode } from "react";

export default function SectionHead({
  eyebrow,
  title,
  sub,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "center" | "left";
}) {
  const center = align === "center";
  return (
    <div className={`${center ? "text-center mx-auto" : ""} max-w-3xl`}>
      <p className="eyebrow justify-center" data-reveal>
        {eyebrow}
      </p>
      <h2
        className="mt-5 font-display font-semibold text-[clamp(2rem,4.4vw,3.3rem)] leading-[1.06] tracking-tight text-balance"
        data-reveal
        style={{ ["--rd" as string]: 1 }}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={`mt-5 text-muted text-[1.02rem] leading-relaxed ${center ? "mx-auto" : ""} max-w-2xl`}
          data-reveal
          style={{ ["--rd" as string]: 2 }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
