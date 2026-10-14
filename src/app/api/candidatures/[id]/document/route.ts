import { NextRequest, NextResponse } from "next/server";
import { securedRoute } from "@/lib/auth-server";
import { loadUserRecord } from "@/lib/candidature-server";
import { getDocument } from "@/lib/document-storage";
import { computeSha256 } from "@/lib/pdf-generator";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return securedRoute(async (_request, { user }) => {
    try {
      const { data } = await loadUserRecord(user);
      const application = data.applications.find(a => a.id === id);
      const requestedVersion = new URL(req.url).searchParams.get("version");
      const version = requestedVersion
        ? application?.sentDocumentVersions?.find(v => v.versionId === requestedVersion)
        : application?.sentDocumentVersions?.at(-1);
      if (!version) return NextResponse.json({ ok: false, error: "CV archivé introuvable." }, { status: 404 });
      const stored = await getDocument(user.id, version.documentId, version.versionId);
      const bytes = new Uint8Array(await stored.arrayBuffer());
      if (version.sha256 && await computeSha256(bytes) !== version.sha256) throw new Error("L'intégrité du PDF archivé a échoué.");
      return new NextResponse(bytes, { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(application?.cvName || "cv.pdf").replace(/[\r\n\"]/g, "")}"`,
        "Cache-Control": "no-store", "X-Content-SHA256": version.sha256 || "",
      } });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CV indisponible." }, { status: 503 });
    }
  })(req);
}
