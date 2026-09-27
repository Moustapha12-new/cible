/* Client Supabase Storage REST — sans SDK.
   Jamais d'affichage de clés. Env : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET. */

function cfg(): { url: string; key: string; bucket: string } {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();
  const bucket = (process.env.SUPABASE_BUCKET || "cible-gmail-storage").trim();
  if (!url || !key) {
    throw new Error("Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return { url, key, bucket };
}

function objectUrl(path: string): string {
  const { url, bucket } = cfg();
  const clean = path.replace(/^\/+/, "");
  return `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${clean
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function headers(): Record<string, string> {
  const { key } = cfg();
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    "Content-Type": "application/octet-stream",
  };
}

export async function supabaseGet(path: string): Promise<string | null> {
  try {
    const res = await fetch(objectUrl(path), {
      method: "GET",
      headers: headers(),
      cache: "no-store",
    });
    if (res.status === 404 || !res.ok) return null;
    const text = await res.text();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

export async function supabasePut(path: string, body: string): Promise<void> {
  const res = await fetch(objectUrl(path), {
    method: "PUT",
    headers: { ...headers(), "x-upsert": "true" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase PUT ${res.status}: ${detail.slice(0, 200)}`);
  }
}

export async function supabaseDelete(path: string): Promise<void> {
  try {
    const res = await fetch(objectUrl(path), {
      method: "DELETE",
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok && res.status !== 404) {
      /* best-effort */
    }
  } catch {
    /* best-effort */
  }
}

/** Health check local : PUT/GET/DELETE d'un objet éphémère. */
export async function supabaseHealth(): Promise<boolean> {
  try {
    const path = `gmail/__health_${Date.now()}.txt`;
    await supabasePut(path, "ok");
    const v = await supabaseGet(path);
    await supabaseDelete(path);
    return v === "ok";
  } catch {
    return false;
  }
}
