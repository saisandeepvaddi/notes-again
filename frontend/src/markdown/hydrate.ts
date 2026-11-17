export interface HydrateOptions {
  dark: boolean;
  copyLabel?: string;
}

let mermaidLoad: Promise<typeof import("mermaid").default> | null = null;
let counter = 0;

async function loadMermaid(dark: boolean) {
  mermaidLoad ??= import("mermaid").then((module) => module.default);
  const mermaid = await mermaidLoad;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
    fontFamily: "inherit",
  });
  return mermaid;
}

export async function renderDiagrams(root: HTMLElement, dark: boolean, isActive: () => boolean) {
  const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-block:not([data-rendered])")];
  if (blocks.length === 0) return;
  const mermaid = await loadMermaid(dark);
  for (const block of blocks) {
    if (!isActive()) return;
    const source = block.dataset.mermaid ?? block.querySelector("code")?.textContent ?? "";
    try {
      const { svg } = await mermaid.render(`mermaid-${++counter}`, source);
      if (!isActive()) return;
      block.innerHTML = svg;
      block.dataset.rendered = "true";
    } catch {
      block.dataset.rendered = "error";
      block.classList.add("mermaid-error");
    }
  }
}

export function addCopyButtons(root: HTMLElement, label = "Copy") {
  root.querySelectorAll<HTMLElement>("pre.shiki:not([data-copy])").forEach((pre) => {
    pre.dataset.copy = "true";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
      void navigator.clipboard?.writeText(text.replace(/\n$/, "")).then(() => {
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = label;
        }, 1500);
      });
    });
    pre.appendChild(button);
  });
}

export function hydrate(root: HTMLElement, options: HydrateOptions, isActive: () => boolean) {
  addCopyButtons(root, options.copyLabel);
  void renderDiagrams(root, options.dark, isActive);
}
