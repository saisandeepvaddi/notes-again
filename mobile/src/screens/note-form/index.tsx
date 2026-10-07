import type { Difficulty } from "@web/notes/new-note-form/types";
import type { ReviewStatus } from "@web/notes/reviewStatus";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCreateNote, useProjects } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { DifficultyPicker } from "@/components/difficulty-picker";
import { HeaderTextButton } from "@/components/header-text-button";
import { ProjectPicker } from "@/components/project-picker";
import {
  RichEditorBody,
  RichEditorToolbar,
  TOOLBAR_HEIGHT,
  useRichEditor,
} from "@/components/rich-editor";
import { ReviewStatusPicker } from "@/components/review-status-picker";
import { InlineError } from "@/components/screen-state";
import { SettingRow } from "@/components/setting-row";
import { TagPicker } from "@/components/tag-picker";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const NEW_NOTE_HINTS: Record<ReviewStatus, string> = {
  active: "Due for its first review right away.",
  paused: "Kept out of review for now. You can resume it any time.",
  "note-only": "A plain note with no reviews or due dates. You can add it to review later.",
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't save the note";

function useDiscardGuard(dirty: boolean) {
  const router = useRouter();
  return () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard this note?", "It hasn’t been saved yet.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };
}

export function NewNoteScreen() {
  const { colors } = useTheme();
  const { family } = useReadingFont();
  const router = useRouter();
  const createNote = useCreateNote();
  const editor = useRichEditor();
  const { attachScroll, onScroll } = editor.bridge;
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [statusChoice, setStatusChoice] = useState<ReviewStatus | null>(null);
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const status = statusChoice ?? (project?.paused ? "paused" : "active");
  const [error, setError] = useState<string | null>(null);
  const cancel = useDiscardGuard(name.trim() !== "" || content.trim() !== "");

  const save = async () => {
    if (!name.trim() || createNote.isPending) return;
    setError(null);
    try {
      await createNote.mutateAsync({
        name: name.trim(),
        content,
        difficulty,
        projectId,
        tagIds,
        status,
      });
      router.back();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderTextButton label="Cancel" onPress={cancel} />,
          headerRight: () => (
            <HeaderTextButton
              label="Save"
              prominent
              onPress={() => void save()}
              disabled={!name.trim()}
              loading={createNote.isPending}
            />
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAwareScrollView
          ref={attachScroll}
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={onScroll}
          scrollEventThrottle={16}
          bottomOffset={TOOLBAR_HEIGHT + 16}
          extraKeyboardSpace={TOOLBAR_HEIGHT}
          contentContainerStyle={{
            paddingHorizontal: space.gutter + 4,
            paddingTop: 12,
            paddingBottom: 40,
            gap: 24,
          }}
        >
          {error ? <InlineError message={error} /> : null}
          <View style={{ gap: 10 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Title"
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="next"
              accessibilityLabel="Title"
              style={{
                color: colors.foreground,
                fontFamily: family.semibold,
                fontSize: 26,
                lineHeight: 33,
                padding: 0,
              }}
            />
            <RichEditorBody
              controller={editor}
              markdown=""
              placeholder="Start writing"
              minHeight={200}
              onChange={setContent}
            />
          </View>
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="muted">
                Difficulty
              </AppText>
              <DifficultyPicker value={difficulty} onChange={setDifficulty} />
            </View>
            <SettingRow label="Project">
              <ProjectPicker
                value={projectId}
                onChange={(next) => {
                  setProjectId(next);
                  setStatusChoice(null);
                }}
              />
            </SettingRow>
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="muted">
                Tags
              </AppText>
              <TagPicker value={tagIds} onChange={setTagIds} />
            </View>
            <View style={{ gap: 8 }}>
              <AppText variant="label" tone="muted">
                Review
              </AppText>
              <ReviewStatusPicker value={status} onChange={setStatusChoice} />
              <AppText variant="caption" tone="muted">
                {project?.paused && statusChoice === null
                  ? `Paused because “${project.name}” is paused. Pick In review to review this one anyway.`
                  : NEW_NOTE_HINTS[status]}
              </AppText>
            </View>
          </View>
        </KeyboardAwareScrollView>
        <RichEditorToolbar controller={editor} />
      </View>
    </>
  );
}
