/* P0-1 — Réparation heuristique des textes encodés (checkpoints + HTML).
   Trois familles de corruption observées :
   1. Mojibake : octets UTF-8 décodés en latin1 (« DÃ©veloppez » au lieu de
      « Développez ») — réversible en ré-encodant latin1 → UTF-8.
   2. Entités HTML laissées littérales par l'ancien htmlToPlainText
      (« Ing&#xE9;nieur ») — décodage numérique &#NNN; / &#xHH; (jamais de
      suppression : l'entité valide devient son caractère).
   3. Octets isolés (séquence UTF-8 interrompue : nbsp devenu espace après
      « Â », octets orphelins dans les URL) — décodage octet par octet avec
      repli : séquence valide → caractère, lead C2-C3 orphelin perdu →
      supprimé (perte avérée), reste → caractère latin1 d'origine.
   Si le texte contient encore U+FFFD (octets perdus avant réparation) ou
   des « þ/ý » (artefacts non décodables), le checkpoint est signalé
   corrompu → le dashboard force la re-synchronisation de cet e-mail (au
   lieu d'afficher du texte illisible pour toujours). */

/** Code point → caractère ; entrée invalide (0, hors plage) → suppression. */
export function entityChar(n: number): string {
  if (!Number.isFinite(n) || n < 1 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/** Décode les entités numériques `&#233;` / `&#xE9;` (les valides deviennent
    leur caractère, les invalides sont supprimées — jamais laissées telles quelles). */
export function decodeNumericEntities(s: string): string {
  if (!s || s.indexOf("&#") === -1) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => entityChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => entityChar(parseInt(dec, 10)));
}

/** Motif de mojibake : octets de tête UTF-8 (C2–F4) suivis d'une continuation
    (80–BF), vus comme caractères latin1 (« Ã© », « Â« », « â¬ »). */
const MOJIBAKE_RE = /[\u00c2-\u00f4][\u0080-\u00bf]/;

/** Artefacts d'octets non représentables observés dans les checkpoints
    (« þ/ý » et variantes) : jamais légitimes dans un texte français. */
const ARTIFACT_RE = /[\u00fe\u00fd\u00de\u00dd]/;

/** Vrai si la chaîne ressemble à du UTF-8 décodé en latin1. */
export function looksMojibake(s: string): boolean {
  return !!s && MOJIBAKE_RE.test(s);
}

function isContinuation(b: number): boolean {
  return b >= 0x80 && b <= 0xbf;
}

/** Longueur attendue d'une séquence UTF-8 démarrant par `b`, -1 si invalide. */
function seqLen(b: number): number {
  if (b >= 0xc2 && b <= 0xdf) return 1;
  if (b >= 0xe0 && b <= 0xef) return 2;
  if (b >= 0xf0 && b <= 0xf4) return 3;
  return -1;
}

/** Décode un run latin1 « mojibake » octet par octet avec repli (jamais
    d'U+FFFD) : séquence UTF-8 valide → caractère ; lead C2-C3 orphelin
    (suite perdue, ex « 2Â espace ») → supprimé ; autres octets → caractère
    latin1 d'origine (protège « © », « é », « âge », « ÿ »…). */
function decodeRunLatin1(s: string): string {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out += s[i];
      i++;
      continue;
    }
    const need = seqLen(b);
    if (need >= 0) {
      let valid = i + need < bytes.length;
      for (let k = 1; valid && k <= need; k++) if (!isContinuation(bytes[i + k])) valid = false;
      if (valid) {
        /* Séquence complète : rejoue le décodage UTF-8. */
        let cp =
          need === 1
            ? (b & 0x1f) << 6
            : need === 2
              ? ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6)
              : ((b & 0x07) << 18) |
                ((bytes[i + 1] & 0x3f) << 12) |
                ((bytes[i + 2] & 0x3f) << 6);
        cp |= bytes[i + need] & 0x3f;
        if (cp >= 0x20 && !(cp >= 0xd800 && cp <= 0xdfff)) out += String.fromCodePoint(cp);
        i += need + 1;
        continue;
      }
      /* Lead sans suite valide. */
      if (b <= 0xc3) {
        i++; /* C2/C3 orphelin : octet de continuation perdu (nbsp…) → supprimé */
        continue;
      }
    }
    if (b >= 0x80 && b <= 0x9f) {
      i++; /* contrôle latin1 orphelin : jamais légitime → supprimé */
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

/** Réparation complète d'un texte : mojibake (segmenté autour des caractères
    propres > 0xFF, jamais de réparation sur du texte sans paire suspecte)
    puis entités numériques. */
export function repairMojibake(s: string): string {
  if (!s) return s;
  let out = "";
  let run = "";
  const flush = (): void => {
    if (run) {
      out += MOJIBAKE_RE.test(run) ? decodeRunLatin1(run) : run;
      run = "";
    }
  };
  for (const ch of s) {
    if (ch.codePointAt(0)! <= 0xff) {
      run += ch;
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

/** Réparation complète d'un texte : mojibake puis entités numériques. */
export function repairText(s: string): string {
  if (!s) return s;
  const fixed = repairMojibake(s);
  return fixed.indexOf("&#") !== -1 ? decodeNumericEntities(fixed) : fixed;
}

/** Vrai si le texte reste corrompu APRÈS réparation (U+FFFD déjà présent =
    octets perdus, ou artefacts « þ/ý ») → cas « irréversible », re-sync forcée. */
export function isCorruptText(s: string): boolean {
  if (!s) return false;
  const out = repairText(s);
  return out.includes("\ufffd") || ARTIFACT_RE.test(out);
}

/** Répare récursivement toutes les chaînes d'un objet (checkpoint, offre…)
    et signale si l'une d'elles reste irréparable. */
export function repairCheckpoint<T>(value: T): { value: T; corrupted: boolean } {
  let corrupted = false;
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") {
      const out = repairText(x);
      if (isCorruptText(out)) corrupted = true;
      return out;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) o[k] = walk(v);
      return o;
    }
    return x;
  };
  return { value: walk(value) as T, corrupted };
}
