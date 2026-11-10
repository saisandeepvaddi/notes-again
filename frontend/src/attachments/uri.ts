const PATTERN = /^attachment:([a-f0-9]{32})$/;

export interface AttachmentInfo {
  uid: string;
  name: string;
  mime: string;
}

export function attachmentUid(src: string): string | null {
  return PATTERN.exec(src.trim())?.[1] ?? null;
}

export function attachmentMarkdown(attachment: AttachmentInfo): string {
  const label = attachment.name.replace(/[[\]\\\n\r]/g, " ").trim() || "attachment";
  const target = `attachment:${attachment.uid}`;
  return attachment.mime.startsWith("image/") ? `![${label}](${target})` : `[${label}](${target})`;
}

export const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
export const ATTACHMENT_LIMITS = { image: 10 * 1024 * 1024, pdf: 25 * 1024 * 1024 };

export function checkAttachmentFile(file: { size: number; type: string }): string | null {
  if (file.type === "application/pdf") {
    return file.size > ATTACHMENT_LIMITS.pdf ? "PDFs can be up to 25 MB." : null;
  }
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    return file.size > ATTACHMENT_LIMITS.image ? "Images can be up to 10 MB." : null;
  }
  return "Only PNG, JPEG, WebP, GIF and PDF files can be attached.";
}
