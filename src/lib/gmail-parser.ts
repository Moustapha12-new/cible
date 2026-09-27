/* Parsing d'un message Gmail (RAW / FULL / METADATA) → texte, HTML, liens, headers.
   L'API Gmail a déjà appliqué la transfer-encoding : on décode selon le
   charset déclaré uniquement (mime-text.ts) — pas de QP ici. */

import { charsetFromContentType, decodeMimeText } from "@/lib/mime-text";

export type ParsedEmailOut = {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  messageId: string;
  text: string;
  html: string;
  bodyPlain: string;
  bodyHtml: string;
  links: string[];
  headers: Record<string, string>;
  attachments: { filename: string; mimeType: string; size: number; id?: string }[];
};

function decodeB64(data: string, charset?: string | null): string {
  try {
    return decodeMimeText(Buffer.from(data.replace(/\s+/g, ""), "base64"), charset);
  } catch {
    return "";
  }
}

function unfold(block: string): Record<string, string> {
  const flat = block.replace(/\r\n[ \t]+/g, " ").replace(/\n[ \t]+/g, " ").replace(/\r\n/g, "\n");
  const headers: Record<string, string> = {};
  for (const line of flat.split("\n")) {
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (!m) continue;
    headers[m[1].toLowerCase()] = m[2].trim();
  }
  return headers;
}

function extractLinks(html: string, text: string): string[] {
  const set = new Set<string>();
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html))) {
    const u = m[1].trim();
    if (/^https?:\/\//i.test(u)) set.add(u);
  }
  const urlRe = /https?:\/\/[^\s<>"')\]]+/gi;
  for (const u of text.match(urlRe) || []) {
    set.add(u.replace(/[.,;:]+$/, ""));
  }
  return [...set];
}

type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  headers?: { name: string; value: string }[];
  parts?: Part[];
};

function walkParts(
  parts: Part[],
  acc: { text: string[]; html: string[]; attachments: ParsedEmailOut["attachments"] },
  inheritedCharset?: string | null
): void {
  for (const p of parts) {
    const charset =
      charsetFromContentType(
        p.headers?.find((h) => (h.name || "").toLowerCase() === "content-type")?.value
      ) ??
      inheritedCharset ??
      null;
    const mime = (p.mimeType || "").toLowerCase();
    if (mime.startsWith("multipart/")) {
      if (p.parts?.length) walkParts(p.parts, acc, charset);
      continue;
    }
    if (p.body?.attachmentId || (p.filename && p.body?.size)) {
      acc.attachments.push({
        filename: p.filename || "attachment",
        mimeType: mime || "application/octet-stream",
        size: p.body?.size || 0,
        id: p.body?.attachmentId,
      });
      continue;
    }
    const data = p.body?.data || "";
    if (!data) continue;
    const decoded = decodeB64(data, charset);
    if (mime === "text/plain") acc.text.push(decoded);
    else if (mime === "text/html") acc.html.push(decoded);
  }
}

/** Parse un message Gmail API en structure exploitable. */
export function parseMessage(msg: {
  id: string;
  payload?: Part & { headers?: { name: string; value: string }[]; body?: { data?: string } };
  raw?: string;
  internalDate?: string;
  snippet?: string;
}): ParsedEmailOut {
  const payload = msg.payload;
  const headerList = payload?.headers || [];
  const headers: Record<string, string> = {};
  for (const h of headerList) {
    headers[(h.name || "").toLowerCase()] = h.value || "";
  }

  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: ParsedEmailOut["attachments"] = [];
  const rootCharset = charsetFromContentType(headers["content-type"]);

  if (payload?.parts?.length) {
    walkParts(payload.parts as Part[], { text: textParts, html: htmlParts, attachments }, rootCharset);
  } else if (payload?.body?.data) {
    const mime = (payload.mimeType || "").toLowerCase();
    const decoded = decodeB64(payload.body.data, rootCharset);
    if (mime === "text/html") htmlParts.push(decoded);
    else textParts.push(decoded);
  }

  if (!textParts.length && !htmlParts.length && msg.raw) {
    const raw = decodeB64(msg.raw);
    const split = raw.split(/\r?\n\r?\n/);
    const hdr = unfold(split[0] || "");
    Object.assign(headers, hdr);
    const body = split.slice(1).join("\n\n");
    const ct = headers["content-type"] || "";
    if (/text\/html/i.test(ct)) htmlParts.push(body);
    else textParts.push(body);
  }

  const bodyHtml = htmlParts.join("\n");
  const bodyPlain =
    textParts.join("\n") ||
    bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    id: msg.id,
    subject: headers.subject || "",
    from: headers.from || "",
    to: headers.to || "",
    date: headers.date || (msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : ""),
    messageId: headers["message-id"] || msg.id,
    text: bodyPlain,
    html: bodyHtml,
    bodyPlain,
    bodyHtml,
    links: extractLinks(bodyHtml, bodyPlain),
    headers,
    attachments,
  };
}
