import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { downloadDatabase, formatBytes, useSnapshotNow, useSystemInfo } from "./systemApi";

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
          {formatBytes(info.database_size_bytes)} · {info.note_count.toLocaleString()} notes ·
          SQLite {info.sqlite_version}
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
          <PathValue path={backups.directory} />
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

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={downloading} onClick={() => void download()}>
          <DownloadIcon /> {downloading ? "Preparing…" : "Download database"}
        </Button>
        <Button variant="outline" size="sm" disabled={snapshotting} onClick={() => void snapshot()}>
          {snapshotting ? "Saving…" : "Snapshot now"}
        </Button>
      </div>
    </section>
  );
}
