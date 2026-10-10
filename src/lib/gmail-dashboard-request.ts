import type { DashboardPayload } from "./gmail-dashboard";
import { readGmailJson } from "./gmail-response";

const pending = new Map<string, Promise<DashboardPayload>>();

/** Une vérification partagée par compte, bornée dans le temps. */
export function requestGmailDashboard(email: string, fresh = false, timeoutMs = 15_000): Promise<DashboardPayload> {
  const qs = new URLSearchParams({ email });
  if (fresh) qs.set("fresh", "1");
  const key = qs.toString();
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`/api/gmail/dashboard?${key}`, { cache: "no-store", signal: controller.signal });
      const payload = await readGmailJson<DashboardPayload>(response);
      if (!response.ok || !payload.ok) {
        throw Object.assign(new Error(payload.error || payload.reason || "Chargement impossible"), { detail: payload.detail });
      }
      return payload;
    } catch (e) {
      if (controller.signal.aborted) throw new Error("Le serveur Gmail tarde à répondre. Les offres déjà chargées restent disponibles. Réessaie la vérification dans un instant.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();
  pending.set(key, request);
  void request.then(() => pending.delete(key), () => pending.delete(key));
  return request;
}
