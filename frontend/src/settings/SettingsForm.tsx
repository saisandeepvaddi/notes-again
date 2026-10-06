import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ALGORITHM_OPTIONS, type Algorithm } from "./types";
import { useSettings } from "./useSettings";
import { useUpdateSettings } from "./useUpdateSettings";

export function SettingsForm() {
  const { data: settings } = useSettings();
  const { mutateAsync, isPending } = useUpdateSettings();

  const onChange = async (value: Algorithm | null) => {
    if (value === null || value === settings.default_algorithm) return;
    try {
      await mutateAsync(value);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to update settings" });
    }
  };

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Default algorithm for new notes</p>
          <p className="text-xs text-muted-foreground">
            {
              ALGORITHM_OPTIONS.find((option) => option.value === settings.default_algorithm)
                ?.description
            }
          </p>
        </div>
        <Select
          items={ALGORITHM_OPTIONS}
          value={settings.default_algorithm}
          onValueChange={onChange}
          disabled={isPending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALGORITHM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Existing notes keep using whichever algorithm they were created with. This only affects
        notes created from now on.
      </p>
    </div>
  );
}
