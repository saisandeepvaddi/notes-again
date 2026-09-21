import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";

export function ImportButton() {
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={
        <Link to="/import">
          <UploadIcon /> Import
        </Link>
      }
    />
  );
}
