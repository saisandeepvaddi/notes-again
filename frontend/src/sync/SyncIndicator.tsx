import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  ArrowsClockwiseIcon,
  CloudArrowUpIcon,
  CloudCheckIcon,
  CloudSlashIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { refreshSyncedData, syncedAgo, useSyncStatus, type SyncStatus } from "./syncApi";

export function SyncWatcher() {
  const queryClient = useQueryClient();
  const { data: status } = useSyncStatus();
  const lastSeen = useRef<string | undefined>(undefined);
  const seen = status ? `${status.last_changed_at ?? ""}|${status.conflicts}` : undefined;

  useEffect(() => {
    if (seen === undefined) return;
    if (lastSeen.current !== undefined && seen !== lastSeen.current) {
      refreshSyncedData(queryClient);
    }
    lastSeen.current = seen;
  }, [seen, queryClient]);

  return null;
}

function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(id);
  }, []);
}

function describe(status: SyncStatus) {
  if (status.conflicts > 0) {
    return {
      icon: WarningIcon,
      label:
        status.conflicts === 1
          ? "1 note changed in two places"
          : `${status.conflicts} notes changed in two places`,
      tone: "text-destructive",
    };
  }
  if (status.syncing) return { icon: ArrowsClockwiseIcon, label: "Syncing…", tone: "" };
  if (status.last_error) {
    return {
      icon: CloudSlashIcon,
      label: "Can't reach your server",
      tone: "text-muted-foreground",
    };
  }
  if (status.pending) {
    return { icon: CloudArrowUpIcon, label: "Waiting to sync", tone: "text-muted-foreground" };
  }
  const when = status.last_synced_at ? syncedAgo(status.last_synced_at) : null;
  return {
    icon: CloudCheckIcon,
    label: when ? `Synced ${when}` : "Synced",
    tone: "text-muted-foreground",
  };
}

export function SyncIndicator() {
  const { data: status } = useSyncStatus();
  useMinuteTick();
  if (!status?.connected) return null;
  const { icon: Icon, label, tone } = describe(status);
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          tooltip={status.last_error ?? label}
          render={<Link to="/settings" search={{ section: "sync" }} />}
          className={cn("text-xs", tone)}
        >
          <Icon className={cn(status.syncing && "animate-spin motion-reduce:animate-none")} />
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
