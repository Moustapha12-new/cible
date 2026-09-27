/* Décodage MIME partagé (Gmail API, fichiers .eml, parseur) — charset + RFC 2047.

   Règles de décodage (prouvées par probe live Gmail) :
   · L'API Gmail `format=full` renvoie body.data DÉJÀ décodé de la
     transfer-encoding (format=raw contient `=3D`/`=C3`, format=full non) :
     on ne réapplique JAMAIS quoted-printable côté Gmail (double décodage
     destructif : `v=beta` → `v¾ta`).
   · Les fichiers .eml bruts, eux, gardent leur CTE : le QP y est appliqué
     au niveau OCTETS, puis les octets sont interprétés avec le charset
     déclaré (jamais le latin1 forcé). */

/** Extrait le charset d'un en-tête Content-Type (`charset="UTF-8"`…). */
export function charsetFromContentType(contentType?: string | null): string | null {
  if (!contentType) return null;
  const m = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m ? m[1].trim() : null;
}

function isUtf8Label(label: string): boolean {
  return /^utf-?8$/i.test(label);
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Décode des octets MIME en texte : charset déclaré → UTF-8 validé →
 * Windows-1252 → Latin-1. Jamais de U+FFFD silencieux sur un UTF-8 déclaré
 * mais invalide (on retombe sur le chaînage complet dans ce cas).
 */
export function decodeMimeText(buf: Buffer, charset?: string | null): string {
  if (!buf.length) return "";
  const label = (charset || "").trim().replace(/^["']|["']$/g, "");
  if (label) {
    if (isUtf8Label(label)) {
      /* UTF-8 déclaré : validé d'abord → zéro FFFD silencieux. */
      if (isValidUtf8(buf)) return new TextDecoder("utf-8").decode(buf);
    } else {
      try {
        return new TextDecoder(label).decode(buf);
      } catch {
        /* charset inconnu du moteur → chaîne de repli ci-dessous */
      }
    }
  }
  if (isValidUtf8(buf)) return new TextDecoder("utf-8").decode(buf);
  try {
    return new TextDecoder("windows-1252").decode(buf);
  } catch {
    return buf.toString("latin1");
  }
}

/** Quoted-printable au niveau OCTETS (entrées ASCII ; sortie = octets du charset déclaré). */
export function decodeQuotedPrintableBytes(buf: Buffer): Buffer {
  if (!buf.length) return buf;
  const hex = (b: number): boolean =>
    (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
  const out: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x3d /* "=" */ ) {
      if (i + 2 < buf.length && hex(buf[i + 1]) && hex(buf[i + 2])) {
        out.push(parseInt(String.fromCharCode(buf[i + 1], buf[i + 2]), 16));
        i += 2;
        continue;
      }
      if (buf[i + 1] === 0x0d || buf[i + 1] === 0x0a) {
        /* soft line break */
        if (buf[i + 1] === 0x0d && buf[i + 2] === 0x0a) i += 2;
        else i += 1;
        continue;
      }
    }
    out.push(b);
  }
  return Buffer.from(out);
}

/**
 * RFC 2047 : `=?charset?B?base64?=` / `=?charset?Q?quoted-printable?=`
 * (Q : `_` = espace). Honore le charset déclaré dans l'encoded-word.
 * Les en-têtes renvoyés par l'API Gmail sont généralement déjà décodés :
 * la regex ne matche pas et la valeur est renvoyée telle quelle.
 */
export function decodeRfc2047(encoded: string, defaultCharset?: string | null): string {
  if (!encoded || !encoded.includes("=?")) return encoded;
  return encoded.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, enc, type, data) => {
    try {
      const charset = String(enc) || defaultCharset || "utf-8";
      if (/[bB]/.test(type)) return decodeMimeText(Buffer.from(String(data), "base64"), charset);
      const bytes = decodeQuotedPrintableBytes(
        Buffer.from(String(data).replace(/_/g, " "), "latin1")
      );
      return decodeMimeText(bytes, charset);
    } catch {
      return String(data);
    }
  });
}
