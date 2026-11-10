import { z } from "zod";
import { ApiError, getHeaders, getURL } from "@/utils/fetchers";
import { checkAttachmentFile, type AttachmentInfo } from "./uri";

const UploadSchema = z.object({ uid: z.string(), name: z.string(), mime: z.string() });

export async function uploadAttachment(noteId: number, file: File): Promise<AttachmentInfo> {
  const problem = checkAttachmentFile(file);
  if (problem) throw new Error(problem);
  const headers = await getHeaders({
    "Content-Type": "application/octet-stream",
    "X-File-Name": encodeURIComponent(file.name),
  });
  const response = await fetch(`${getURL()}/notes/${noteId}/attachments`, {
    method: "POST",
    headers,
    body: file,
    credentials: "include",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      body && typeof body === "object" && "detail" in body ? String(body.detail) : null;
    throw new ApiError(detail ?? "Could not attach the file.", response.status);
  }
  return UploadSchema.parse(await response.json());
}

const objectUrls = new Map<string, Promise<string>>();

export function attachmentObjectUrl(uid: string): Promise<string> {
  let pending = objectUrls.get(uid);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(`${getURL()}/attachments/${uid}/file`, {
        headers: await getHeaders(),
        credentials: "include",
      });
      if (!response.ok) throw new ApiError("Attachment unavailable.", response.status);
      return URL.createObjectURL(await response.blob());
    })();
    pending.catch(() => objectUrls.delete(uid));
    objectUrls.set(uid, pending);
  }
  return pending;
}
