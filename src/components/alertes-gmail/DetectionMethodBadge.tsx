import type { DetectionMethod } from "@/lib/gmail-dashboard";
import { METHOD_LABEL } from "@/lib/gmail-dashboard";

const ICONS: Record<DetectionMethod, string> = {
  code: "</>",
  ia: "✦",
  "code+ia": "</>✦",
  none: "—",
};

/** Badge méthode de détection : Code / IA / Code + IA. */
export default function DetectionMethodBadge({ method }: { method: DetectionMethod }) {
  if (method === "none") {
    return <span className="mono-label text-muted!">{METHOD_LABEL.none}</span>;
  }
  const cls =
    method === "ia"
      ? "chip chip--mint"
      : method === "code+ia"
        ? "chip chip--mint"
        : "chip";
  return (
    <span className={cls} data-method={method} title={`Détection : ${METHOD_LABEL[method]}`}>
      <span className="mr-1 font-mono opacity-70">{ICONS[method]}</span>
      {METHOD_LABEL[method]}
    </span>
  );
}
