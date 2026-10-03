import { useState } from "react";
import { KeyboardAvoidingView, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { HeaderButton } from "@/components/header-button";
import { TextField } from "@/components/text-field";
import { useTheme } from "@/hooks/use-theme";
import { radius, space } from "@/theme";
import { openLink } from "./shared";

export interface LinkDraft {
  text: string;
  url: string;
  existing: boolean;
}

interface LinkSheetProps {
  draft: LinkDraft | null;
  onSave: (text: string, url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

const withScheme = (url: string) =>
  /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("/")
    ? url
    : `https://${url}`;

function LinkForm({ draft, onSave, onRemove, onClose }: LinkSheetProps & { draft: LinkDraft }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(draft.text);
  const [url, setUrl] = useState(draft.url);
  const trimmedUrl = url.trim();
  const save = () => {
    if (!trimmedUrl) return;
    onSave(text.trim(), withScheme(trimmedUrl));
  };

  return (
    <View
      style={{
        gap: 16,
        paddingHorizontal: space.gutter,
        paddingTop: 18,
        paddingBottom: Math.max(insets.bottom, 16),
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        borderCurve: "continuous",
        borderTopWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText variant="heading" style={{ flex: 1 }}>
          {draft.existing ? "Edit link" : "Add link"}
        </AppText>
        {draft.existing && draft.url ? (
          <HeaderButton
            ios="safari"
            android="open_in_new"
            label="Open link"
            onPress={() => void openLink(draft.url)}
          />
        ) : null}
      </View>
      <TextField
        label="Text"
        value={text}
        onChangeText={setText}
        placeholder="Shown in the note"
        autoFocus={draft.existing || !draft.text}
        returnKeyType="next"
        accessibilityLabel="Link text"
      />
      <TextField
        label="Link"
        value={url}
        onChangeText={setUrl}
        placeholder="https://"
        autoFocus={!draft.existing && !!draft.text}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Link address"
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {draft.existing ? (
          <Button variant="destructive" onPress={onRemove}>
            Remove
          </Button>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button variant="secondary" onPress={onClose}>
          Cancel
        </Button>
        <Button onPress={save} disabled={!trimmedUrl}>
          Save
        </Button>
      </View>
    </View>
  );
}

export function LinkSheet(props: LinkSheetProps) {
  return (
    <Modal
      visible={props.draft !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={props.onClose}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.32)" }}
        />
        {props.draft ? <LinkForm {...props} draft={props.draft} /> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
