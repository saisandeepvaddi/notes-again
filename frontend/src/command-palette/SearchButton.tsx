import { Button } from "@/components/ui/button";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { MOD_KEY_LABEL, useCommandPalette } from "./PaletteContext";

interface SearchButtonProps {
  variant: "sidebar" | "icon";
  className?: string;
}

export function SearchButton({ variant, className }: SearchButtonProps) {
  const { setOpen } = useCommandPalette();
  if (variant === "icon") {
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Search"
        className={className}
        onClick={() => setOpen(true)}
      >
        <MagnifyingGlassIcon />
      </Button>
    );
  }
  return (
    <SidebarMenuButton
      className={className}
      aria-keyshortcuts="Meta+/ Control+/"
      onClick={() => setOpen(true)}
    >
      <MagnifyingGlassIcon />
      <span>Search</span>
      <kbd className="ml-auto font-sans text-[0.625rem] tracking-wide text-muted-foreground [@media(pointer:coarse)]:hidden">
        {MOD_KEY_LABEL} /
      </kbd>
    </SidebarMenuButton>
  );
}
