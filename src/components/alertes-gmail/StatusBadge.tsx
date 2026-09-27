import type { EmailVisualStatus } from "@/lib/gmail-dashboard";
import { STATUS_CLASS, STATUS_GLYPH, STATUS_LABEL } from "@/lib/gmail-dashboard";

/** Badge coloré selon le statut visuel d'un e-mail. */
export default function StatusBadge({ status }: { status: EmailVisualStatus }) {
  const cls =
    status === "success"
      ? "pill pill--ok"
      : status === "warning"
        ? "pill pill--wait"
        : status === "error"
          ? "pill"
          : "pill";
  const color =
    status === "error"
      ? "text-red"
      : status === "warning"
        ? "text-amber"
        : STATUS_CLASS[status];
  return (
    <span className={cls} data-status={status}>
      <span className={`mr-1 ${color}`}>{STATUS_GLYPH[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}
