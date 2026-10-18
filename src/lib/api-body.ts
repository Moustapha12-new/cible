export type ApiBodyOptions = { bodyFormat?: "json" | "multipart"; maxBodyBytes?: number };
export class ApiBodyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Contrôle borné sur une copie : le handler conserve le corps original lisible. */
export async function readApiBody(request: Request, options: ApiBodyOptions = {}): Promise<Record<string, unknown>> {
  const limit = options.maxBodyBytes || 2_000_000;
  if (Number(request.headers.get("content-length") || 0) > limit) throw new ApiBodyError(413, "Requête trop volumineuse.");
  if (options.bodyFormat === "multipart" && !/^multipart\/form-data\b/i.test(request.headers.get("content-type") || "")) throw new ApiBodyError(415, "Envoie le PDF avec le formulaire d'import.");
  const reader = request.clone().body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          void reader.cancel().catch(() => {});
          throw new ApiBodyError(413, "Requête trop volumineuse.");
        }
        if (options.bodyFormat !== "multipart") chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  if (options.bodyFormat === "multipart") return {};
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const raw = new TextDecoder().decode(bytes);
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new ApiBodyError(400, "Requête invalide."); }
}
