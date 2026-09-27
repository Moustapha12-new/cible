/* Chargement d'un fichier .eml en ParsedEmail — sans dépendance externe.
   Node.js n'expose pas de module « email » natif : on parse RFC 5322 / MIME
   (multipart, base64, quoted-printable, RFC 2047) avec seulement Buffer/String. */

import { readFileSync } from "node:fs";
import type { ParsedEmail } from "@/lib/gmail-server";
import {
  charsetFromContentType,
  decodeMimeText,
  decodeQuotedPrintableBytes,
  decodeRfc2047,
} from "@/lib/mime-text";
import { entityChar } from "@/lib/text-repair";

/* Les fichiers .eml bruts gardent leur transfer-encoding : le quoted-printable
   y est appliqué au niveau octets, puis les octets passent par le charset
   déclaré (mime-text.ts) — jamais le latin1 forcé. */

function unfoldHeaders(block: string): Record<string, string> {
  const flat = block.replace(/\r\n[ \t]+/g, " ").replace(/\n[ \t]+/g, " ").replace(/\r/g, "\n");
  const headers: Record<string, string> = {};
  for (const line of flat.split("\n")) {
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const value = m[2].trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

function decodeBody(data: string, cte: string, contentType?: string | null): string {
  const charset = charsetFromContentType(contentType);
  const t = (cte || "").trim().toLowerCase();
  if (t === "base64") {
    try {
      return decodeMimeText(Buffer.from(data.replace(/\s+/g, ""), "base64"), charset);
    } catch {
      return "";
    }
  }
  if (t === "quoted-printable") {
    return decodeMimeText(decodeQuotedPrintableBytes(Buffer.from(data, "latin1")), charset);
  }
  return data;
}

function getBoundary(contentType: string): string | null {
  const m = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(contentType || "");
  return m ? m[1].trim() : null;
}

function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  const parts: string[] = [];
  let idx = body.indexOf(delim);
  while (idx !== -1) {
    const start = idx + delim.length;
    if (body.slice(start, start + 2) === "--") break;
    let next = body.indexOf(delim, start);
    if (next === -1) next = body.length;
    let chunk = body.slice(start, next);
    if (chunk.startsWith("\r\n")) chunk = chunk.slice(2);
    else if (chunk.startsWith("\n")) chunk = chunk.slice(1);
    if (chunk.endsWith("\r\n")) chunk = chunk.slice(0, -2);
    else if (chunk.endsWith("\n")) chunk = chunk.slice(0, -1);
    if (chunk.trim()) parts.push(chunk);
    idx = next;
  }
  return parts;
}

type Part = { headers: Record<string, string>; body: string };

function parsePart(raw: string): Part {
  const sep = raw.indexOf("\r\n\r\n") !== -1 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  const cut = sep === -1 ? raw.length : sep;
  const head = raw.slice(0, cut);
  let body = sep === -1 ? "" : raw.slice(sep + (raw[sep] === "\r" ? 4 : 2));
  const headers = unfoldHeaders(head);
  const cte = headers["content-transfer-encoding"] || "";
  const contentType = headers["content-type"] || "";
  const boundary = getBoundary(contentType);
  if (boundary) {
    /* multipart : le découpage récursif se fait dans collectTextHtml /
       parseEml via splitMultipart — pas de décodage ici. */
    return { headers, body };
  }
  body = decodeBody(body, cte, contentType);
  return { headers, body };
}

function collectTextHtml(root: Part, acc: { plain: string[]; html: string[] }): void {
  const ct = (root.headers["content-type"] || "").toLowerCase();
  const boundary = getBoundary(root.headers["content-type"] || "");
  if (boundary) {
    for (const chunk of splitMultipart(root.body, boundary)) {
      collectTextHtml(parsePart(chunk), acc);
    }
    return;
  }
  if (ct.startsWith("text/plain")) acc.plain.push(root.body);
  else if (ct.startsWith("text/html")) acc.html.push(root.body);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    /* P0-1 : les entités numériques sont DÉCODÉES (jamais supprimées) —
       `&#233;` → é, `&#xE9;` → é — AVANT &amp; (un « &amp;#233; » littéral
       reste « &#233; » : il ne doit pas être ré-interprété). */
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => entityChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => entityChar(parseInt(d, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n +/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Même logique que extractLinks de gmail-server (privé) : hrefs d'abord, puis texte. */
function extractLinks(text: string, html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let u = (raw || "").trim().replace(/&amp;/gi, "&");
    if (u.length < 10) return;
    if (u.startsWith("//")) u = `https:${u}`;
    if (u.startsWith("www.")) u = `https://${u}`;
    if (!/^https?:\/\//i.test(u)) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  const hrefRe = /<a\s[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const m of html.match(hrefRe) ?? []) {
    const href = m.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (href) push(href[1] || href[2] || href[3] || "");
  }
  for (const m of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) push(m);
  return out.slice(0, 60);
}

function splitEnvelope(raw: string): { headers: Record<string, string>; body: string } {
  const crlf = raw.indexOf("\r\n\r\n");
  const lf = raw.indexOf("\n\n");
  let cut = -1;
  let skip = 4;
  if (crlf !== -1 && (lf === -1 || crlf <= lf)) {
    cut = crlf;
    skip = 4;
  } else if (lf !== -1) {
    cut = lf;
    skip = 2;
  }
  const head = cut === -1 ? raw : raw.slice(0, cut);
  const body = cut === -1 ? "" : raw.slice(cut + skip);
  return { headers: unfoldHeaders(head), body };
}

export function parseEml(raw: string, fallbackId: string): ParsedEmail {
  const { headers, body } = splitEnvelope(raw);
  const subject = decodeRfc2047(headers["subject"] || "") || "(sans objet)";
  const from = decodeRfc2047(headers["from"] || "");
  const dateRaw = headers["date"] || "";
  let receivedAt = new Date().toISOString();
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) receivedAt = d.toISOString();
  }

  const acc = { plain: [] as string[], html: [] as string[] };
  const ct = headers["content-type"] || "";
  const boundary = getBoundary(ct);
  if (boundary) {
    for (const chunk of splitMultipart(body, boundary)) {
      collectTextHtml(parsePart(chunk), acc);
    }
  } else {
    const cte = headers["content-transfer-encoding"] || "";
    const decoded = decodeBody(body, cte, ct);
    if (ct.toLowerCase().startsWith("text/html")) acc.html.push(decoded);
    else acc.plain.push(decoded);
  }

  const html = acc.html.join("\n");
  const plain = acc.plain.join("\n").trim();
  const text = (plain || htmlToPlainText(html)).slice(0, 40_000);

  const mid = (headers["message-id"] || "").replace(/^<|>$/g, "").trim();
  const id = fallbackId || mid || headers["message-id"] || "eml-unknown";

  return {
    id,
    subject,
    from,
    receivedAt,
    text,
    html,
    links: extractLinks(text, html),
  };
}

export function loadEmlFile(filePath: string, fallbackId?: string): ParsedEmail {
  const raw = readFileSync(filePath, "utf8");
  return parseEml(raw, fallbackId ?? filePath);
}
