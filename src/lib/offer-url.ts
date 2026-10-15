export function offerExternalUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || /[\s<>]/.test(value)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^(https?):$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.href;
  } catch { return null; }
}
