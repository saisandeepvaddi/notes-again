import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowCounterClockwiseIcon, CopyIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  type Snapshot,
  type SystemInfo,
  downloadDatabase,
  downloadSnapshot,
  formatBytes,
  useRestoreSnapshot,
  useSetBackupFolder,
  useSnapshotNow,
  useSnapshots,
  useSystemInfo,
} from "./systemApi";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function showError(error: unknown, fallback: string) {
  toast.add({ type: "error", priority: "high", description: errorMessage(error, fallback) });
}

function BackupFolder({ backups }: { backups: SystemInfo["backups"] }) {
  const [value, setValue] = useState(backups.custom_directory ? backups.directory : "");
  const { mutateAsync: setFolder, isPending } = useSetBackupFolder();

  const save = async (directory: string | null) => {
    try {
      const info = await setFolder(directory);
      setValue(info.backups.custom_directory ? info.backups.directory : "");
      toast.add({
        type: "success",
        description: directory ? "Backup folder saved" : "Using the default backup folder",
      });
    } catch (error) {
      showError(error, "Couldn't change the backup folder");
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save(value.trim() || null);
      }}
    >
      <Input
        aria-label="Backup folder"
        value={value}
        placeholder={backups.default_directory}
        onChange={(event) => setValue(event.target.value)}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        A folder in iCloud Drive, Dropbox or on a network drive keeps a copy off this computer.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          Save folder
        </Button>
        {backups.custom_directory ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => void save(null)}
          >
            Use default
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function RestoreButton({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  const { mutateAsync: restore, isPending } = useRestoreSnapshot();
  const taken = format(new Date(snapshot.created_at), "PPp");

  const confirm = async () => {
    try {
      await restore(snapshot.name);
      setOpen(false);
      toast.add({ type: "success", description: "Restoring. Notes Again reloads in a moment." });
    } catch (error) {
      showError(error, "Restore failed");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="xs" aria-label={`Restore snapshot from ${taken}`}>
            <ArrowCounterClockwiseIcon /> Restore
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore the snapshot from {taken}?</AlertDialogTitle>
          <AlertDialogDescription>
            Your notes go back to how they were then. The current database is kept next to it, so
            nothing is lost. If this computer syncs with a server, the restored notes sync too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirm()} disabled={isPending}>
            Restore and reload
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SnapshotList({ canRestore }: { canRestore: boolean }) {
  const { data: snapshots, isPending, isError } = useSnapshots();
  if (isPending) return <p className="text-xs text-muted-foreground">Loading snapshots…</p>;
  if (isError) return <p className="text-xs text-destructive">Couldn't list the snapshots.</p>;
  if (snapshots.length === 0) return <p className="text-xs text-muted-foreground">None yet.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-md border text-xs">
      {snapshots.map((snapshot) => (
        <li key={snapshot.name} className="flex items-center gap-2 px-3 py-1.5">
          <span className="min-w-0 flex-1">
            {format(new Date(snapshot.created_at), "PPp")}
            <span className="text-muted-foreground"> · {formatBytes(snapshot.size_bytes)}</span>
          </span>
          <Button
            variant="ghost"
            size="xs"
            aria-label={`Download snapshot ${snapshot.name}`}
            onClick={() =>
              void downloadSnapshot(snapshot.name).catch((error: unknown) =>
                showError(error, "Download failed"),
              )
            }
          >
            <DownloadSimpleIcon /> Download
          </Button>
          {canRestore ? <RestoreButton snapshot={snapshot} /> : null}
        </li>
      ))}
    </ul>
  );
}

const DEPLOY_DOCS_URL =
  "https://github.com/saisandeepvaddi/notes-again/blob/main/docs/self-hosting.md#off-site-backup-with-litestream";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-baseline gap-3 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function PathValue({ path }: { path: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      toast.add({ type: "success", description: "Path copied" });
    } catch {
      toast.add({ type: "error", description: "Couldn't copy the path" });
    }
  };
  return (
    <span className="flex items-center gap-1">
      <code className="min-w-0 break-all font-mono text-xs">{path}</code>
      <Button variant="ghost" size="icon-xs" aria-label="Copy path" onClick={() => void copy()}>
        <CopyIcon />
      </Button>
    </span>
  );
}

export function SystemSettings() {
  const { data: info } = useSystemInfo();
  const { mutateAsync: snapshotNow, isPending: snapshotting } = useSnapshotNow();
  const [downloading, setDownloading] = useState(false);
  const { backups } = info;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadDatabase();
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Download failed",
      });
    } finally {
      setDownloading(false);
    }
  };

  const snapshot = async () => {
    try {
      const taken = await snapshotNow();
      toast.add({ type: "success", description: `Snapshot saved as ${taken.name}` });
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Snapshot failed",
      });
    }
  };

  return (
    <section className="flex max-w-xl flex-col gap-4" aria-labelledby="data-heading">
      <div>
        <h2 id="data-heading" className="text-sm font-medium">
          Data & backups
        </h2>
        <p className="text-xs text-muted-foreground">
          All your notes live in one SQLite file. Copy it anywhere to back it up.
        </p>
      </div>

      <dl className="flex flex-col gap-2">
        <Row label="Database file">
          <PathValue path={info.database_path} />
          {info.in_container ? (
            <p className="mt-1 text-xs text-muted-foreground">
              This path is inside the container's <code>/data</code> volume.
            </p>
          ) : null}
        </Row>
        <Row label="Size">
          {formatBytes(info.database_size_bytes)} · {info.note_count.toLocaleString()}{" "}
          {info.note_count === 1 ? "note" : "notes"} · SQLite {info.sqlite_version}
        </Row>
        <Row label="Local snapshots">
          {backups.interval_hours === 0 ? (
            "Off"
          ) : (
            <>
              Every {backups.interval_hours === 24 ? "day" : `${backups.interval_hours} hours`},
              keeping the last {backups.keep}.{" "}
              {backups.latest
                ? `Latest ${formatDistanceToNow(new Date(backups.latest.created_at), { addSuffix: true })} (${formatBytes(backups.latest.size_bytes)}).`
                : "None yet."}
            </>
          )}
        </Row>
        <Row label="Snapshot folder">
          {backups.can_change_directory ? (
            <BackupFolder backups={backups} />
          ) : (
            <PathValue path={backups.directory} />
          )}
        </Row>
        <Row label="Off-site backup">
          {backups.offsite_url ? (
            <>
              Litestream → <code className="font-mono">{backups.offsite_url}</code>
            </>
          ) : (
            <>
              Not set up.{" "}
              <a href={DEPLOY_DOCS_URL} target="_blank" rel="noreferrer" className="underline">
                How to add one
              </a>
            </>
          )}
        </Row>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">Snapshots</h3>
        <SnapshotList canRestore={backups.can_restore} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
          <DownloadSimpleIcon /> {downloading ? "Preparing…" : "Download database"}
        </Button>
        <Button variant="outline" size="sm" disabled={snapshotting} onClick={() => void snapshot()}>
          {snapshotting ? "Saving…" : "Snapshot now"}
        </Button>
      </div>
    </section>
  );
}
