import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
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
          <DownloadIcon /> Export
        </Button>
      }
    />
  );
}
