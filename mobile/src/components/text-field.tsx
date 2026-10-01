import { useState, type Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { AppText } from "@/components/app-text";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  mono?: boolean;
  ref?: Ref<TextInput>;
}

export function TextField({
  label,
  hint,
  mono,
  style,
  ref,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          {
            minHeight: 46,
            paddingHorizontal: 12,
            paddingVertical: 11,
            borderRadius: radius.md,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: focused ? colors.primary : colors.border,
            backgroundColor: colors.card,
            color: colors.foreground,
            fontFamily: mono ? fonts.mono : fonts.sans,
            fontSize: mono ? 14 : 16,
          },
          focused && { boxShadow: `0 0 0 3px ${colors.primaryTint}` },
          style,
        ]}
      />
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
