import { attachmentMarkdown, checkAttachmentFile, type AttachmentInfo } from "@web/attachments/uri";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { z } from "zod";
import { fetchFile, uploadFile } from "@/api/client";

export { attachmentMarkdown };

const UploadSchema = z.object({ uid: z.string(), name: z.string(), mime: z.string() });
const MAX_CACHED = 24;
const dataUrls = new Map<string, Promise<string>>();

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the attachment."));
    reader.readAsDataURL(blob);
  });
}

export function attachmentDataUrl(uid: string): Promise<string> {
  let pending = dataUrls.get(uid);
  if (!pending) {
    pending = fetchFile(`/attachments/${uid}/file`).then(async (response) =>
      blobToDataUrl(await response.blob()),
    );
    pending.catch(() => dataUrls.delete(uid));
    dataUrls.set(uid, pending);
    if (dataUrls.size > MAX_CACHED) dataUrls.delete(dataUrls.keys().next().value as string);
  }
  return pending;
}

export async function openAttachment(uid: string) {
  const response = await fetchFile(`/attachments/${uid}/file`);
  const disposition = response.headers.get("content-disposition") ?? "";
  const name =
    /filename="([^"]+)"/.exec(disposition)?.[1]?.replace(/[^\w.\- ]/g, "_") || `${uid}.pdf`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(await response.arrayBuffer()));
  await Sharing.shareAsync(file.uri, { mimeType: response.headers.get("content-type") ?? undefined });
}

export interface PickedFile {
  uri: string;
  name: string;
  mime: string;
  size: number;
}

export async function pickPhoto(): Promise<PickedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? "photo",
    mime: asset.mimeType ?? "image/jpeg",
    size: asset.fileSize ?? 0,
  };
}

export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.name,
    mime: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? 0,
  };
}

export async function uploadPicked(noteId: number, picked: PickedFile): Promise<AttachmentInfo> {
  const blob = await (await fetch(picked.uri)).blob();
  const problem = checkAttachmentFile({ size: picked.size || blob.size, type: picked.mime });
  if (problem) throw new Error(problem);
  return UploadSchema.parse(await uploadFile(`/notes/${noteId}/attachments`, blob, picked.name));
}
