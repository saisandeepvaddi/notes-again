import type { ReviewStatus } from "@web/notes/reviewStatus";
import { Stack, useRouter } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCreateNote, useProjects, useTags } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
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
import { useNewNoteDraft } from "@/hooks/use-new-note-draft";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const NEW_NOTE_HINTS: Record<ReviewStatus, string> = {
  active: "Due for its first review right away.",
  paused: "Kept out of review for now. You can resume it any time.",
  "note-only": "A plain note with no reviews or due dates. You can add it to review later.",
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't save the note";

export function NewNoteScreen() {
  const { colors } = useTheme();
  const { family } = useReadingFont();
  const router = useRouter();
  const createNote = useCreateNote();
  const editor = useRichEditor();
  const { attachScroll, onScroll } = editor.bridge;
  const recovery = useNewNoteDraft();
  const { name, content, difficulty, statusChoice } = recovery.draft;
  const projectId = recovery.draft.project?.id ?? null;
  const tagIds = recovery.draft.tags.map((tag) => tag.id);
  const [initialContent] = useState(content);
  const [editorKey, setEditorKey] = useState(0);
  const [completed, setCompleted] = useState(false);
  const navigation = useNavigation();
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const project = projects.find((p) => p.id === projectId) ?? recovery.draft.project;
  const status = statusChoice ?? (project?.paused ? "paused" : "active");
  const [error, setError] = useState<string | null>(null);
  usePreventRemove(
    !completed && (createNote.isPending || (recovery.hasDraft && !recovery.saved)),
    ({ data }) => {
      if (createNote.isPending) return;
      Alert.alert(
        "Leave without saving this draft?",
        "This device couldn’t save your draft. Leaving will lose your unfinished note.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Leave anyway",
            style: "destructive",
            onPress: () => navigation.dispatch(data.action),
          },
        ],
      );
    },
  );
  useEffect(() => {
    if (completed) router.back();
  }, [completed, router]);
  const discard = () =>
    Alert.alert(
      "Discard this draft?",
      "This clears the unfinished note from this device. It can’t be undone.",
      [
        { text: "Keep editing", style: "cancel" },
        {
          text: "Discard draft",
          style: "destructive",
          onPress: () => {
            if (recovery.discard()) setEditorKey((key) => key + 1);
          },
        },
      ],
    );

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
      recovery.discard();
      setCompleted(true);
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderTextButton
              label="Close"
              disabled={createNote.isPending}
              onPress={() => router.back()}
            />
          ),
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
          {recovery.hasDraft ? (
            <View style={{ gap: 8 }}>
              <AppText variant="caption" tone="muted">
                {recovery.saved
                  ? recovery.restored
                    ? "Draft restored. Saved on this device only."
                    : "Draft saved on this device only."
                  : "Draft couldn’t be saved on this device. Keep this screen open until you save the note."}
              </AppText>
              <Button variant="ghost" size="sm" disabled={createNote.isPending} onPress={discard}>
                Discard draft
              </Button>
            </View>
          ) : null}
          <View pointerEvents={createNote.isPending ? "none" : "auto"} style={{ gap: 24 }}>
            <View style={{ gap: 10 }}>
              <TextInput
                value={name}
                onChangeText={(value) => recovery.update({ name: value })}
                editable={!createNote.isPending}
                placeholder="Title"
                placeholderTextColor={colors.mutedForeground}
                selectionColor={colors.primary}
                cursorColor={colors.primary}
                multiline
                submitBehavior="blurAndSubmit"
                returnKeyType="next"
              accessibilityLabel="Title"
              testID="note-title"
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
                key={editorKey}
                markdown={editorKey === 0 ? initialContent : ""}
                placeholder="Start writing"
                minHeight={200}
                onChange={(value) => recovery.update({ content: value })}
              />
            </View>
            <View style={{ gap: 14 }}>
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="muted">
                  Difficulty
                </AppText>
                <DifficultyPicker
                  value={difficulty}
                  onChange={(value) => recovery.update({ difficulty: value })}
                />
              </View>
              <SettingRow label="Project">
                <ProjectPicker
                  value={projectId}
                  onChange={(next) => {
                    recovery.update({
                      project:
                        next === null
                          ? null
                          : (projects.find((item) => item.id === next) ?? {
                              id: next,
                              name: "",
                              paused: false,
                            }),
                      statusChoice: null,
                    });
                  }}
                />
              </SettingRow>
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="muted">
                  Tags
                </AppText>
                <TagPicker
                  value={tagIds}
                  onChange={(ids) =>
                    recovery.update({
                      tags: ids.map(
                        (id) =>
                          tags.find((tag) => tag.id === id) ??
                          recovery.draft.tags.find((tag) => tag.id === id) ?? {
                            id,
                            name: "",
                            is_difficulty: false,
                          },
                      ),
                    })
                  }
                />
              </View>
              <View style={{ gap: 8 }}>
                <AppText variant="label" tone="muted">
                  Review
                </AppText>
                <ReviewStatusPicker
                  value={status}
                  onChange={(value) => recovery.update({ statusChoice: value })}
                />
                <AppText variant="caption" tone="muted">
                  {project?.paused && statusChoice === null
                    ? `Paused because “${project.name}” is paused. Pick In review to review this one anyway.`
                    : NEW_NOTE_HINTS[status]}
                </AppText>
              </View>
            </View>
          </View>
        </KeyboardAwareScrollView>
        <RichEditorToolbar controller={editor} />
      </View>
    </>
  );
}
