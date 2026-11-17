import DOMPurify from "dompurify";

const EMBED_HOSTS = new Set(["www.youtube-nocookie.com", "player.vimeo.com"]);
const URI =
  /^(?:(?:https?|mailto|tel|note|attachment):|data:image\/(?:png|jpeg|webp|gif);|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let purifier: ReturnType<typeof DOMPurify> | null = null;

function instance() {
  if (purifier) return purifier;
  const created = DOMPurify(window);
  created.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const src = (node as Element).getAttribute("src") ?? "";
    let host = "";
    try {
      host = new URL(src).hostname;
    } catch {
      host = "";
    }
    if (!EMBED_HOSTS.has(host)) node.parentNode?.removeChild(node);
  });
  created.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "INPUT" && node.getAttribute("type") !== "checkbox") node.remove();
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
  purifier = created;
  return created;
}

export function sanitizeHtml(html: string): string {
  return instance().sanitize(html, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_TAGS: ["iframe", "video", "audio", "source"],
    ADD_ATTR: [
      "target",
      "controls",
      "playsinline",
      "preload",
      "allowfullscreen",
      "loading",
      "referrerpolicy",
    ],
    ALLOWED_URI_REGEXP: URI,
    FORBID_TAGS: ["style", "form", "button", "script", "object", "embed"],
    ALLOW_DATA_ATTR: true,
  });
}
