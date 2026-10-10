/** Les erreurs du proxy/hébergeur peuvent être du texte ou du HTML. */
export async function readGmailJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch {
    const timeout = response.status === 504 || /FUNCTION_INVOCATION_TIMEOUT|timed out/i.test(text);
    throw Object.assign(new Error(timeout
      ? "Le serveur a interrompu la synchronisation. Les offres déjà enregistrées sont conservées : relance pour reprendre."
      : `Le serveur Gmail a renvoyé une réponse invalide (HTTP ${response.status}). Réessaie dans un instant.`),
    { detail: `HTTP ${response.status}`, status: response.status });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Réponse Gmail invalide. Réessaie dans un instant.");
  return payload as T;
}
