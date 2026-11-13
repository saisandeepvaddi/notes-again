export interface MediaItem {
  uid: string;
  alt: string;
  src: string;
}

export const MAX_MEDIA = 20;
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MIN_SVG_WIDTH = 100;
const MIN_SVG_HEIGHT = 60;
const MAX_SVG_SIDE = 2400;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function newMediaUid(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function mediaLink(item: MediaItem): string {
  return `![${item.alt}](attachment:${item.uid})`;
}

export function usedMedia(content: string, media: MediaItem[]): MediaItem[] {
  return media.filter((item) => content.includes(`(attachment:${item.uid})`));
}

export function withoutMedia(content: string, media: MediaItem[], keep: ReadonlySet<string>) {
  let next = content;
  for (const item of media) {
    if (keep.has(item.uid)) continue;
    const replacement = /^https?:/.test(item.src) ? `![${item.alt}](${item.src})` : item.alt;
    next = next.split(mediaLink(item)).join(replacement);
  }
  return next;
}

export function bestImageUrl(image: Element, base: string): string | null {
  const candidates: { url: string; weight: number }[] = [];
  const add = (srcset: string | null) => {
    for (const part of (srcset ?? "").split(",")) {
      const [url, descriptor] = part.trim().split(/\s+/);
      if (!url) continue;
      const weight = descriptor ? Number.parseFloat(descriptor) || 1 : 1;
      candidates.push({ url, weight });
    }
  };
  const picture = image.closest("picture");
  picture?.querySelectorAll("source").forEach((source) => {
    if (!source.getAttribute("type")?.includes("svg")) add(source.getAttribute("srcset"));
  });
  add(image.getAttribute("srcset") ?? image.getAttribute("data-srcset"));
  for (const attribute of ["src", "data-src", "data-original", "data-lazy-src"]) {
    const value = image.getAttribute(attribute);
    if (value && !value.startsWith("data:")) {
      candidates.push({ url: value, weight: 0.5 });
      break;
    }
  }
  candidates.sort((a, b) => b.weight - a.weight);
  for (const { url } of candidates) {
    try {
      const resolved = new URL(url, base);
      if (/^https?:$/.test(resolved.protocol)) return resolved.href;
    } catch {}
  }
  return null;
}

export function isTinyImage(image: Element): boolean {
  const width = Number.parseInt(image.getAttribute("width") ?? "", 10);
  const height = Number.parseInt(image.getAttribute("height") ?? "", 10);
  return (
    (Number.isFinite(width) && width > 0 && width < 40) ||
    (Number.isFinite(height) && height > 0 && height < 40)
  );
}

export async function rasterizeSvgs(doc: Document): Promise<Map<number, string>> {
  const view = doc.defaultView;
  const out = new Map<number, string>();
  if (!view) return out;
  const svgs = Array.from(doc.querySelectorAll("svg"));
  for (const [index, svg] of svgs.entries()) {
    if (out.size >= MAX_MEDIA || svg.closest("button, a[role='button'], [aria-hidden='true']"))
      continue;
    const box = svg.getBoundingClientRect();
    if (box.width < MIN_SVG_WIDTH || box.height < MIN_SVG_HEIGHT) continue;
    try {
      const url = await svgToPng(view, svg, box.width, box.height);
      if (url) out.set(index, url);
    } catch {}
  }
  return out;
}

async function svgToPng(
  view: Window & typeof globalThis,
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<string | null> {
  const scale = Math.min(2, MAX_SVG_SIDE / Math.max(width, height));
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(Math.round(width)));
  copy.setAttribute("height", String(Math.round(height)));
  if (!copy.getAttribute("viewBox")) copy.setAttribute("viewBox", `0 0 ${width} ${height}`);
  copy.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
  const markup = new view.XMLSerializer().serializeToString(copy);
  const image = new view.Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("svg"));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await loaded;
  const canvas = view.document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export interface FetchedMedia {
  item: MediaItem;
  blob: Blob;
  name: string;
}

function fileNameFor(item: MediaItem, type: string) {
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
  let base = "";
  try {
    base = decodeURIComponent(new URL(item.src).pathname.split("/").pop() ?? "");
  } catch {}
  const clean = base.replace(/\.[a-z0-9]{2,5}$/i, "").trim() || item.alt.trim() || "image";
  return `${clean.slice(0, 80)}.${extension}`;
}

export async function fetchMedia(
  item: MediaItem,
  doFetch: typeof fetch = fetch,
): Promise<FetchedMedia | null> {
  try {
    const response = await doFetch(item.src, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_MEDIA_BYTES) return null;
    const blob = await response.blob();
    const type = (blob.type.split(";")[0] ?? "").trim().toLowerCase();
    if (!IMAGE_TYPES.has(type) || blob.size === 0 || blob.size > MAX_MEDIA_BYTES) return null;
    return { item, blob, name: fileNameFor(item, type) };
  } catch {
    return null;
  }
}

export async function fetchAllMedia(
  media: MediaItem[],
  doFetch: typeof fetch = fetch,
  concurrency = 4,
): Promise<Map<string, FetchedMedia>> {
  const results = new Map<string, FetchedMedia>();
  let next = 0;
  const worker = async () => {
    while (next < media.length) {
      const item = media[next++];
      if (!item) break;
      const fetched = await fetchMedia(item, doFetch);
      if (fetched) results.set(item.uid, fetched);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, media.length) }, worker));
  return results;
}
