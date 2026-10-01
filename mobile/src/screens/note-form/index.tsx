import type { Difficulty, NoteItem } from "@web/notes/new-note-form/types";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";
import { useCreateNote, useNote, useUpdateNote } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { DifficultyPicker } from "@/components/difficulty-picker";
import { HeaderTextButton } from "@/components/header-text-button";
import { ProjectPicker } from "@/components/project-picker";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { SettingRow } from "@/components/setting-row";
import { TagPicker } from "@/components/tag-picker";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius, space } from "@/theme";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Couldn't save the note";

function useDiscardGuard(dirty: boolean) {
  const router = useRouter();
  return () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert("Discard changes?", "Your edits haven’t been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };
}

function ContentFields({
  name,
  content,
  onName,
  onContent,
}: {
  name: string;
  content: string;
  onName: (value: string) => void;
  onContent: (value: string) => void;
}) {
  const { colors } = useTheme();
  const input = {
    color: colors.foreground,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderCurve: "continuous" as const,
    paddingHorizontal: 14,
  };
  return (
    <>
      <TextInput
        value={name}
        onChangeText={onName}
        placeholder="Title"
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="next"
        accessibilityLabel="Title"
        style={{ ...input, fontFamily: fonts.serifSemibold, fontSize: 20, paddingVertical: 12 }}
      />
      <TextInput
        value={content}
        onChangeText={onContent}
        placeholder={"Write in Markdown.\n\nCode blocks, lists and links all work."}
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        autoCapitalize="sentences"
        accessibilityLabel="Content"
        style={{
          ...input,
          fontFamily: fonts.mono,
          fontSize: 15,
          lineHeight: 22,
          minHeight: 220,
          paddingVertical: 12,
        }}
      />
    </>
  );
}

export function NewNoteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const createNote = useCreateNote();
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const cancel = useDiscardGuard(name.trim() !== "" || content.trim() !== "");

  const save = async () => {
    if (!name.trim() || createNote.isPending) return;
    setError(null);
    try {
      await createNote.mutateAsync({ name: name.trim(), content, difficulty, projectId, tagIds });
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
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: space.gutter, gap: 14, paddingBottom: 40 }}
      >
        {error ? <InlineError message={error} /> : null}
        <ContentFields name={name} content={content} onName={setName} onContent={setContent} />
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="muted">
            Difficulty
          </AppText>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        </View>
        <SettingRow label="Project">
          <ProjectPicker value={projectId} onChange={setProjectId} />
        </SettingRow>
        <View style={{ gap: 8 }}>
          <AppText variant="label" tone="muted">
            Tags
          </AppText>
          <TagPicker value={tagIds} onChange={setTagIds} />
        </View>
        <AppText variant="caption" tone="muted">
          New notes are due for their first review right away.
        </AppText>
      </ScrollView>
    </>
  );
}

function EditForm({ note }: { note: NoteItem }) {
  const { colors } = useTheme();
  const router = useRouter();
  const updateNote = useUpdateNote(note.id);
  const [name, setName] = useState(note.name);
  const [content, setContent] = useState(note.content);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== note.name || content !== note.content;
  const cancel = useDiscardGuard(dirty);

  const save = async () => {
    if (!name.trim() || updateNote.isPending) return;
    if (!dirty) {
      router.back();
      return;
    }
    setError(null);
    try {
      await updateNote.mutateAsync({ name: name.trim(), content });
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
              loading={updateNote.isPending}
            />
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ padding: space.gutter, gap: 14, paddingBottom: 40 }}
      >
        {error ? <InlineError message={error} /> : null}
        <ContentFields name={name} content={content} onName={setName} onContent={setContent} />
      </ScrollView>
    </>
  );
}

export function EditNoteScreen({ id }: { id: number }) {
  const query = useNote(id);
  if (query.data && !query.isPlaceholderData) return <EditForm note={query.data} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingState />;
}
