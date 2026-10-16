/** Strong cross-source identity for the same public ATS posting. A title alone
 * never proves that two different postings are the same job. */
export function discoveryUrlKey(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const match = host === "jobs.smartrecruiters.com" && url.pathname.match(/^\/([^/]+)\/(\d{9,})/);
    if (match) return `smartrecruiters:${match[1].toLowerCase()}:${match[2]}`;
    return null;
  } catch { return null; }
}
