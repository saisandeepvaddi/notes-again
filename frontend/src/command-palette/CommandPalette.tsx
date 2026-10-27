import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { applyNoteAlign, applyNoteBorder, storeNoteAlign, storeNoteBorder } from "@/lib/noteLayout";
import { cn } from "@/lib/utils";
import { useDueCount } from "@/notes/notes-list/useDueNotes";
import { REVIEW_STATUS_ICONS } from "@/notes/ReviewStatusPicker";
import { REVIEW_STATUS_LABELS } from "@/notes/reviewStatus";
import { useTheme } from "@/theme/ThemeProvider";
import {
  ArrowsOutLineHorizontalIcon,
  ClockCounterClockwiseIcon,
  FileTextIcon,
  FolderIcon,
  GearIcon,
  MagnifyingGlassIcon,
  MonitorIcon,
  MoonIcon,
  NotebookIcon,
  PlusIcon,
  RepeatIcon,
  SidebarSimpleIcon,
  SpinnerGapIcon,
  SquareIcon,
  SunIcon,
  TagIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TrashIcon,
  TreeStructureIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Marked } from "./Marked";
import { MOD_KEY_LABEL, useCommandPalette, type PaletteCommand } from "./PaletteContext";
import { getRecentNotes, type RecentNote } from "./recentNotes";
import { useSearch, type NamedHit, type NoteHit } from "./searchApi";

interface Row {
  value: string;
  href?: string;
  destructive?: boolean;
  onSelect: () => void;
  content: ReactNode;
}

interface Section {
  heading: string;
  rows: Row[];
}

interface AppCommand extends PaletteCommand {
  section: string;
  hint?: string;
}

const COMMAND_PREFIX = ">";
const MAX_COMMANDS_WITH_RESULTS = 5;

function matchesTerms(command: PaletteCommand, terms: string[]) {
  const haystack = `${command.label} ${command.keywords ?? ""}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function useAppCommands(): AppCommand[] {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();
  const { data: dueCount = 0 } = useDueCount();
  const borderOn =
    typeof document !== "undefined" && document.documentElement.dataset.noteBorder === "on";

  const go = "Go to";
  const look = "Appearance";
  const setAlign = (align: "center" | "left" | "full") => {
    storeNoteAlign(align);
    applyNoteAlign(align);
  };

  return [
    {
      id: "new-note",
      section: go,
      label: "New note",
      icon: PlusIcon,
      keywords: "create add write",
      run: () => navigate({ to: "/notes/new" }),
    },
    {
      id: "go-notes",
      section: go,
      label: "All Notes",
      icon: NotebookIcon,
      keywords: "list browse",
      run: () => navigate({ to: "/notes" }),
    },
    {
      id: "go-review",
      section: go,
      label: "Review",
      icon: RepeatIcon,
      keywords: "due study practice",
      hint: dueCount > 0 ? `${dueCount.toLocaleString()} due` : undefined,
      run: () => navigate({ to: "/review" }),
    },
    {
      id: "go-import",
      section: go,
      label: "Import",
      icon: UploadSimpleIcon,
      keywords: "upload markdown files",
      run: () => navigate({ to: "/import" }),
    },
    {
      id: "go-organize",
      section: go,
      label: "Organize",
      icon: TreeStructureIcon,
      keywords: "projects tags manage",
      run: () => navigate({ to: "/organize" }),
    },
    {
      id: "go-trash",
      section: go,
      label: "Trash",
      icon: TrashIcon,
      keywords: "deleted restore",
      run: () => navigate({ to: "/trash" }),
    },
    {
      id: "go-settings",
      section: go,
      label: "Settings",
      icon: GearIcon,
      keywords: "preferences options",
      run: () => navigate({ to: "/settings" }),
    },
    {
      id: "theme-light",
      section: look,
      label: "Light theme",
      icon: SunIcon,
      keywords: "appearance mode color",
      run: () => setTheme("light"),
    },
    {
      id: "theme-dark",
      section: look,
      label: "Dark theme",
      icon: MoonIcon,
      keywords: "appearance mode color night",
      run: () => setTheme("dark"),
    },
    {
      id: "theme-system",
      section: look,
      label: "Match system theme",
      icon: MonitorIcon,
      keywords: "appearance mode color auto",
      run: () => setTheme("system"),
    },
    {
      id: "toggle-sidebar",
      section: look,
      label: "Toggle sidebar",
      icon: SidebarSimpleIcon,
      keywords: "hide show panel navigation",
      hint: `${MOD_KEY_LABEL} B`,
      run: toggleSidebar,
    },
    {
      id: "width-center",
      section: look,
      label: "Note width: Centered",
      icon: TextAlignCenterIcon,
      keywords: "layout align column",
      run: () => setAlign("center"),
    },
    {
      id: "width-left",
      section: look,
      label: "Note width: Left",
      icon: TextAlignLeftIcon,
      keywords: "layout align column",
      run: () => setAlign("left"),
    },
    {
      id: "width-full",
      section: look,
      label: "Note width: Full width",
      icon: ArrowsOutLineHorizontalIcon,
      keywords: "layout align column wide",
      run: () => setAlign("full"),
    },
    {
      id: "editor-border",
      section: look,
      label: borderOn ? "Hide editor border" : "Show editor border",
      icon: SquareIcon,
      keywords: "outline frame box paper",
      run: () => {
        storeNoteBorder(!borderOn);
        applyNoteBorder(!borderOn);
      },
    },
  ];
}

function RowIcon({ icon: Icon, className }: { icon: PaletteCommand["icon"]; className?: string }) {
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0 text-muted-foreground group-data-[selected=true]/row:text-foreground",
        className,
      )}
    />
  );
}

function CommandRow({ command, hint }: { command: PaletteCommand; hint?: string }) {
  return (
    <>
      <RowIcon
        icon={command.icon}
        className={cn(
          command.destructive && "text-destructive group-data-[selected=true]/row:text-destructive",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {hint && <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{hint}</span>}
    </>
  );
}

function NoteRow({ hit }: { hit: NoteHit }) {
  const StatusIcon = REVIEW_STATUS_ICONS[hit.status];
  return (
    <>
      <RowIcon icon={FileTextIcon} className="mt-0.5" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-reading text-[0.8125rem] font-medium">
            {hit.title ? <Marked text={hit.title_marked} /> : "Untitled"}
          </span>
          {hit.status !== "active" && (
            <StatusIcon
              role="img"
              aria-label={REVIEW_STATUS_LABELS[hit.status]}
              className="size-3 shrink-0 self-center text-muted-foreground"
            />
          )}
          {hit.project && (
            <span className="max-w-[40%] shrink-0 truncate text-[0.6875rem] text-muted-foreground">
              {hit.project.name}
            </span>
          )}
        </span>
        {hit.snippet && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            <Marked text={hit.snippet} />
          </span>
        )}
      </span>
    </>
  );
}

function NamedRow({ hit, icon }: { hit: NamedHit; icon: PaletteCommand["icon"] }) {
  return (
    <>
      <RowIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">
        <Marked text={hit.name_marked} />
      </span>
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
        {hit.note_count.toLocaleString()} {hit.note_count === 1 ? "note" : "notes"}
      </span>
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm border bg-muted px-1 font-sans text-[0.625rem] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

export function CommandPalette() {
  const { open, setOpen, pageCommands } = useCommandPalette();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState("");
  const [recent, setRecent] = useState<RecentNote[]>([]);
  const appCommands = useAppCommands();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (!open) return;
    setInput("");
    const current = /^\/notes\/(\d+)/.exec(pathname)?.[1];
    setRecent(getRecentNotes().filter((note) => String(note.id) !== current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = input.trimStart();
  const commandMode = trimmed.startsWith(COMMAND_PREFIX);
  const text = (commandMode ? trimmed.slice(COMMAND_PREFIX.length) : input).trim();
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);

  const search = useSearch(commandMode ? "" : text, open && !commandMode);
  const results = text && !commandMode ? search.data : undefined;

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const openNote = (id: number) =>
    navigate({ to: "/notes/$noteId", params: { noteId: String(id) } });

  const commandSections = (limit?: number): Section[] => {
    const all: AppCommand[] = [
      ...pageCommands.map((command) => ({ ...command, section: "This note" })),
      ...appCommands,
    ];
    const matching = all.filter((command) => matchesTerms(command, terms)).slice(0, limit);
    const order = [...new Set(matching.map((command) => command.section))];
    return order.map((heading) => ({
      heading: limit ? "Commands" : heading,
      rows: matching
        .filter((command) => command.section === heading)
        .map((command) => ({
          value: `command:${command.id}`,
          destructive: command.destructive,
          onSelect: () => run(command.run),
          content: <CommandRow command={command} hint={command.hint} />,
        })),
    }));
  };

  const sections: Section[] = [];
  if (commandMode || !text) {
    if (!commandMode && recent.length > 0) {
      sections.push({
        heading: "Recent",
        rows: recent.map((note) => ({
          value: `recent:${note.id}`,
          href: `/notes/${note.id}`,
          onSelect: () => run(() => openNote(note.id)),
          content: (
            <>
              <RowIcon icon={ClockCounterClockwiseIcon} />
              <span className="min-w-0 flex-1 truncate font-reading text-[0.8125rem] font-medium">
                {note.title || "Untitled"}
              </span>
            </>
          ),
        })),
      });
    }
    sections.push(...commandSections());
  } else {
    const noteRows: Row[] = (results?.notes ?? []).map((hit) => ({
      value: `note:${hit.id}`,
      href: `/notes/${hit.id}`,
      onSelect: () => run(() => openNote(hit.id)),
      content: <NoteRow hit={hit} />,
    }));
    if (noteRows.length > 0) {
      noteRows.push({
        value: "search-all",
        onSelect: () => run(() => navigate({ to: "/notes", search: { q: text } })),
        content: (
          <>
            <RowIcon icon={MagnifyingGlassIcon} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground group-data-[selected=true]/row:text-foreground">
              Show all notes matching “{text}”
            </span>
          </>
        ),
      });
    }
    if (noteRows.length > 0) sections.push({ heading: "Notes", rows: noteRows });
    if (results?.projects.length) {
      sections.push({
        heading: "Projects",
        rows: results.projects.map((hit) => ({
          value: `project:${hit.id}`,
          onSelect: () => run(() => navigate({ to: "/notes", search: { projectId: hit.id } })),
          content: <NamedRow hit={hit} icon={FolderIcon} />,
        })),
      });
    }
    if (results?.tags.length) {
      sections.push({
        heading: "Tags",
        rows: results.tags.map((hit) => ({
          value: `tag:${hit.id}`,
          onSelect: () => run(() => navigate({ to: "/notes", search: { tagId: hit.id } })),
          content: <NamedRow hit={hit} icon={TagIcon} />,
        })),
      });
    }
    sections.push(...commandSections(MAX_COMMANDS_WITH_RESULTS));
  }

  const rows = sections.flatMap((section) => section.rows);
  const rowSignature = rows.map((row) => row.value).join("|");
  const firstValue = rows[0]?.value ?? "";
  useEffect(() => {
    setSelected(firstValue);
  }, [rowSignature, firstValue]);

  const noteCount = results?.notes.length ?? 0;
  const searching = !commandMode && text.length > 0;
  const firstLoad = searching && !results && search.pending;
  const failed = searching && search.isError && !search.isFetching;
  const nothingFound =
    rows.length === 0 && !firstLoad && !failed && (commandMode || searching || terms.length > 0);

  const announcement = useMemo(() => {
    if (!searching || search.pending || !results) return "";
    return noteCount === 0
      ? "No notes found"
      : `${noteCount} ${noteCount === 1 ? "note" : "notes"} found`;
  }, [searching, search.pending, results, noteCount]);

  const openInNewTab = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    const row = rows.find((item) => item.value === selected);
    if (!row?.href) return;
    event.preventDefault();
    window.open(row.href, "_blank", "noopener");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-2 max-w-[calc(100%-1rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12dvh] sm:max-w-[40rem]"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <DialogDescription className="sr-only">
          Search notes, projects and tags, or type {COMMAND_PREFIX} to run a command.
        </DialogDescription>
        <CommandPrimitive
          shouldFilter={false}
          loop
          value={selected}
          onValueChange={setSelected}
          onKeyDown={openInNewTab}
          label="Search and commands"
          className="flex min-h-0 min-w-0 flex-col"
        >
          <div className="flex items-center gap-2.5 border-b px-3.5">
            {search.pending && searching ? (
              <SpinnerGapIcon
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin text-muted-foreground"
              />
            ) : (
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
            <CommandPrimitive.Input
              value={input}
              onValueChange={setInput}
              placeholder={commandMode ? "Run a command…" : "Search notes, or type > for commands"}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <span className="hidden sm:block [@media(pointer:coarse)]:hidden">
              <Kbd>esc</Kbd>
            </span>
          </div>
          <CommandPrimitive.List className="max-h-[min(28rem,calc(100dvh-9rem))] scroll-py-1.5 overflow-y-auto overscroll-contain p-1.5 outline-none">
            {firstLoad && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</div>
            )}
            {failed && (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs">
                <span className="flex items-center gap-1.5 text-destructive">
                  <WarningCircleIcon className="size-3.5" />
                  Couldn't search right now.
                </span>
                <button
                  type="button"
                  onClick={() => void search.refetch()}
                  className="rounded-md px-2 py-1 text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Try again
                </button>
              </div>
            )}
            {nothingFound && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {commandMode ? "No commands match." : `Nothing matches “${text}”.`}
              </div>
            )}
            {sections.map((section) => (
              <CommandPrimitive.Group
                key={section.heading}
                heading={section.heading}
                className="pb-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-2 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:text-[0.6875rem] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground"
              >
                {section.rows.map((row) => (
                  <CommandPrimitive.Item
                    key={row.value}
                    value={row.value}
                    onSelect={row.onSelect}
                    className={cn(
                      "group/row flex min-h-8 cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-xs select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [@media(pointer:coarse)]:min-h-11",
                      row.value.startsWith("note:") && "items-start py-2",
                      row.destructive && "text-destructive data-[selected=true]:text-destructive",
                    )}
                  >
                    {row.content}
                  </CommandPrimitive.Item>
                ))}
              </CommandPrimitive.Group>
            ))}
          </CommandPrimitive.List>
          <div className="hidden items-center gap-3 border-t px-3.5 py-2 text-[0.6875rem] text-muted-foreground sm:flex [@media(pointer:coarse)]:hidden">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              to move
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              to open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>{MOD_KEY_LABEL}</Kbd>
              <Kbd>↵</Kbd>
              new tab
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd>{COMMAND_PREFIX}</Kbd>
              commands
            </span>
          </div>
          <div aria-live="polite" className="sr-only">
            {announcement}
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
