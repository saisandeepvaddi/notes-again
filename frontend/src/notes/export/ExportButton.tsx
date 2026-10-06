import { Button } from "@/components/ui/button";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { ExportDialog } from "./ExportDialog";

interface ExportButtonProps {
  projectId?: number;
  tagId?: number;
}

export function ExportButton({ projectId, tagId }: ExportButtonProps) {
  return (
    <ExportDialog
      defaultProjectId={projectId}
      defaultTagId={tagId}
      trigger={
        <Button variant="outline">
          <DownloadSimpleIcon /> Export
        </Button>
      }
    />
  );
}
