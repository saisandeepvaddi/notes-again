import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, type ReviewStatus } from "@web/notes/reviewStatus";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

interface ReviewStatusPickerProps {
  value: ReviewStatus;
  onChange: (status: ReviewStatus) => void;
  disabled?: boolean;
}

export function ReviewStatusPicker({ value, onChange, disabled }: ReviewStatusPickerProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: "row",
        padding: 3,
        gap: 3,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: colors.secondary,
      }}
    >
      {REVIEW_STATUSES.map((status) => {
        const selected = status === value;
        return (
          <Pressable
            key={status}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => !selected && onChange(status)}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              borderCurve: "continuous",
              backgroundColor: selected ? colors.card : "transparent",
              boxShadow: selected ? "0 1px 2px rgba(0, 0, 0, 0.08)" : undefined,
            }}
          >
            <Text
              style={{
                fontFamily: selected ? fonts.sansSemibold : fonts.sansMedium,
                fontSize: 14,
                color: selected ? colors.foreground : colors.mutedForeground,
              }}
            >
              {REVIEW_STATUS_LABELS[status]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
