import type { Icon } from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  icon: Icon;
  keywords?: string;
  destructive?: boolean;
  run: () => void;
}

interface PaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  pageCommands: PaletteCommand[];
  registerPageCommands: (owner: string, commands: PaletteCommand[] | null) => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl";

function isEditorTarget(target: EventTarget | null) {
  return (
    target instanceof Element && target.closest("[contenteditable='true'], .cm-editor") !== null
  );
}

function isPaletteShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
  if (event.key === "/") return true;
  return event.key.toLowerCase() === "k" && !event.shiftKey && !isEditorTarget(event.target);
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [registry, setRegistry] = useState<Record<string, PaletteCommand[]>>({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isPaletteShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  const registerPageCommands = useCallback((owner: string, commands: PaletteCommand[] | null) => {
    setRegistry((current) => {
      const next = { ...current };
      if (commands) next[owner] = commands;
      else delete next[owner];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, pageCommands: Object.values(registry).flat(), registerPageCommands }),
    [open, registry, registerPageCommands],
  );

  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function useCommandPalette() {
  const context = useContext(PaletteContext);
  if (!context) throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  return context;
}

export function usePageCommands(owner: string, commands: PaletteCommand[]) {
  const { registerPageCommands } = useCommandPalette();
  useEffect(() => {
    registerPageCommands(owner, commands);
    return () => registerPageCommands(owner, null);
  }, [owner, commands, registerPageCommands]);
}
