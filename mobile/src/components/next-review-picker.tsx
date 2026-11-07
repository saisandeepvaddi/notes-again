import DateTimePicker from "@expo/ui/community/datetime-picker";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/button";
import { useTheme } from "@/hooks/use-theme";

interface NextReviewPickerProps {
  value: Date;
  onChange: (date: Date) => void;
  disabled?: boolean;
}

export function NextReviewPicker({ value, onChange, disabled }: NextReviewPickerProps) {
  const { colors, scheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (process.env.EXPO_OS === "ios") {
    return (
      <DateTimePicker
        value={value}
        mode="datetime"
        display="compact"
        accentColor={colors.primary}
        themeVariant={scheme}
        disabled={disabled}
        onChange={(event, date) => {
          if (event.type === "set" && date) onChange(date);
        }}
      />
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onPress={() => setOpen(true)} disabled={disabled}>
        {format(value, "EEE, MMM d")}
      </Button>
      {open ? (
        <DateTimePicker
          value={value}
          mode="date"
          presentation="dialog"
          accentColor={colors.primary}
          onChange={(event, date) => {
            setOpen(false);
            if (event.type !== "set" || !date) return;
            const next = new Date(date);
            next.setHours(value.getHours(), value.getMinutes(), 0, 0);
            onChange(next);
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
