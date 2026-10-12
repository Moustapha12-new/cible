import { supabaseAuthHeaders, supabaseServerConfig, supabaseStorageError } from "./supabase-server";
import { validateDocumentFile } from "./pfe-documents";

const IDENTIFIER = /^[a-zA-Z0-9-]{12,80}$/;
export function documentObjectPath(ownerId: string, documentId: string, versionId: string): string {
  if (![ownerId, documentId, versionId].every(value => IDENTIFIER.test(value))) throw new Error("Identifiant de document invalide.");
  return `documents/${ownerId}/${documentId}/${versionId}`;
}
export function documentFileError(name: string, mime: string, bytes: Uint8Array): string | null {
  const basic = validateDocumentFile(name, mime, bytes.byteLength);
  if (basic) return basic;
  const ext = name.toLowerCase().split(".").pop();
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (ext === "pdf" && !starts(0x25, 0x50, 0x44, 0x46)) return "Ce fichier n'est pas un PDF valide.";
  if ((ext === "docx" || ext === "odt") && !starts(0x50, 0x4b)) return "Le document bureautique est invalide.";
  if (ext === "png" && !starts(0x89, 0x50, 0x4e, 0x47)) return "Image PNG invalide.";
  if ((ext === "jpg" || ext === "jpeg") && !starts(0xff, 0xd8, 0xff)) return "Image JPEG invalide.";
  if (ext === "webp" && !(starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")) return "Image WEBP invalide.";
  return null;
}
function storageConfig() {
  const config = supabaseServerConfig();
  if (!config) throw new Error("Stockage documentaire indisponible : configure Supabase Storage.");
  return config;
}
export async function putDocument(ownerId: string, documentId: string, versionId: string, bytes: Uint8Array, mime: string): Promise<void> {
  const config = storageConfig();
  const path = documentObjectPath(ownerId, documentId, versionId);
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path}`, {
    method: "POST", headers: { ...supabaseAuthHeaders(config.key), "Content-Type": mime || "application/octet-stream", "x-upsert": "false" },
    body: Buffer.from(bytes), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 409) throw new Error("Cette version existe déjà ; aucun fichier n'a été remplacé.");
  if (!response.ok) throw supabaseStorageError(response.status, await response.text().catch(() => ""));
}
export async function getDocument(ownerId: string, documentId: string, versionId: string): Promise<Response> {
  const config = storageConfig();
  const path = documentObjectPath(ownerId, documentId, versionId);
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path}`, {
    headers: supabaseAuthHeaders(config.key), cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw supabaseStorageError(response.status, await response.text().catch(() => ""));
  return response;
}