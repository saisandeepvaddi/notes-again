import { filenameFromDisposition, saveBlob } from "@/lib/saveFile";
import { getTextFetcher } from "@/utils/fetchers";

const fetchNoteMarkdown = (noteId: number, download = false) =>
  getTextFetcher(`/notes/${noteId}/markdown${download ? "?download=1" : ""}`)();

export async function copyNoteMarkdown(noteId: number, beforeFetch: () => Promise<unknown>) {
  const text = beforeFetch()
    .then(() => fetchNoteMarkdown(noteId))
    .then((result) => result.text);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await text);
}

export async function downloadNoteMarkdown(noteId: number, beforeFetch: () => Promise<unknown>) {
  await beforeFetch();
  const { text, headers } = await fetchNoteMarkdown(noteId, true);
  saveBlob(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
    filenameFromDisposition(headers.get("Content-Disposition")) ?? `note-${noteId}.md`,
  );
}
