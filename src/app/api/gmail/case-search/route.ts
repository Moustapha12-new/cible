import { NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { getAccessToken } from "@/lib/gmail-server";
import { parseMessage } from "@/lib/gmail-parser";

export const dynamic = "force-dynamic";

export const GET = securedRoute(async (req, auth) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3 || q.length > 100) return NextResponse.json({ ok: false, error: "Saisis au moins trois caractères, sans dépasser 100." }, { status: 400 });
  try {
    const token = await getAccessToken(auth.user.email);
    const headers = { Authorization: `Bearer ${token}` };
    const base = process.env.GMAIL_API_BASE || "https://gmail.googleapis.com/gmail/v1";
    const listing = await fetch(`${base}/users/me/messages?q=${encodeURIComponent(q)}&maxResults=30`, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!listing.ok) return NextResponse.json({ ok: false, error: "Recherche Gmail indisponible. Reconnecte Gmail ou réessaie." }, { status: 502 });
    const list = await listing.json() as { messages?: { id: string; threadId?: string }[] };
    const ids = (list.messages || []).filter(item => /^[a-zA-Z0-9_-]{5,100}$/.test(item.id)).slice(0, 20);
    const found = await Promise.allSettled(ids.map(async item => {
      const response = await fetch(`${base}/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Message inaccessible");
      const raw = await response.json();
      const parsed = parseMessage(raw);
      return { id: item.id, threadId: item.threadId, messageId: parsed.messageId, from: parsed.from, subject: parsed.subject,
        date: parsed.date && !Number.isNaN(Date.parse(parsed.date)) ? new Date(parsed.date).toISOString() : "", snippet: parsed.text.slice(0, 400), text: parsed.text.slice(0, 6000), links: parsed.links.slice(0, 30),
        attachments: parsed.attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, size: a.size })),
        gmailUrl: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(item.id)}` };
    }));
    const messages = found.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    return NextResponse.json({ ok: true, messages, partial: found.some(result => result.status === "rejected"), limited: (list.messages || []).length > ids.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "Gmail indisponible. Vérifie la connexion et réessaie ; aucun message n'a été modifié." }, { status: 503 }); }
});
