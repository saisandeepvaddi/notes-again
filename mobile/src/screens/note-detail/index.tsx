import { getDifficulty } from "@web/notes/difficulty";
import type { NoteItem, Rating } from "@web/notes/new-note-form/types";
import { RATING_OPTIONS } from "@web/notes/rating";
import { reviewStatusOf, type ReviewStatus } from "@web/notes/reviewStatus";
import { format } from "date-fns";
import { Stack, useRouter } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useState } from "react";
import { type ReactNode } from "react";
import { Alert, Share, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  fetchNoteMarkdown,
  isDue,
  pendingReminder,
  useDeleteNote,
  useNote,
  useNoteIntervals,
  useReschedule,
  useSetDifficulty,
  useSetNoteTags,
  useSetReviewStatus,
  useSetProject,
} from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DifficultyPicker } from "@/components/difficulty-picker";
import { HeaderButton } from "@/components/header-button";
import { HeaderTextButton } from "@/components/header-text-button";
import { NextReviewPicker } from "@/components/next-review-picker";
import { NoteBody } from "@/components/note-body";
import {
  type RichEditorController,
  RichEditorBody,
  RichEditorToolbar,
  TOOLBAR_HEIGHT,
  useRichEditor,
} from "@/components/rich-editor";
import { NoteMeta } from "@/components/note-meta";
import { ProjectPicker } from "@/components/project-picker";
import { RatingBar } from "@/components/rating-bar";
import { ReviewStatusPicker } from "@/components/review-status-picker";
import { TagPicker } from "@/components/tag-picker";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { Divider, SettingRow } from "@/components/setting-row";
import { UndoBar } from "@/components/undo-bar";
import { type SaveStatus, useNoteAutosave } from "@/hooks/use-note-autosave";
import { useReviewActions } from "@/hooks/use-review-actions";
import { useReadingFont } from "@/hooks/use-reading-font";
import { useTheme } from "@/hooks/use-theme";
import { ratingTint, space } from "@/theme";
import { dueLabel, noteTitle } from "@/utils/note-format";

const STATUS_HINTS: Record<ReviewStatus, string> = {
  active: "Comes up for review on its schedule.",
  paused: "Kept out of review for now. Switch back to pick up its schedule.",
  "note-only": "A plain note with no reviews or due dates.",
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function ReviewHistory({ note }: { note: NoteItem }) {
  const { scheme } = useTheme();
  const reviews = note.reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0))
    .slice(0, 5);
  if (reviews.length === 0) return null;

  return (
    <Card>
      <AppText variant="heading">Recent reviews</AppText>
      {reviews.map((reminder) => {
        const rating = RATING_OPTIONS.find((option) => option.value === reminder.rating);
        return (
          <View key={reminder.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AppText tone="muted" style={{ flex: 1 }}>
              {reminder.reviewed_at ? format(reminder.reviewed_at, "MMM d, yyyy") : ""}
            </AppText>
            {rating ? <Badge label={rating.label} tint={ratingTint(rating.value, scheme)} /> : null}
          </View>
        );
      })}
    </Card>
  );
}

function NoteSettings({
  note,
  beforeDelete,
}: {
  note: NoteItem;
  beforeDelete?: () => Promise<void>;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const setDifficulty = useSetDifficulty(note.id);
  const setProject = useSetProject(note.id);
  const setReviewStatus = useSetReviewStatus(note.id);
  const setTags = useSetNoteTags(note.id);
  const reschedule = useReschedule(note.id);
  const status = reviewStatusOf(note);
  const pending = pendingReminder(note);
  const tagIds = note.tags.filter((tag) => !tag.is_difficulty).map((tag) => tag.id);
  const deleteNote = useDeleteNote(note.id);
  const [error, setError] = useState<string | null>(null);

  const save = async (task: () => Promise<unknown>) => {
    setError(null);
    try {
      await task();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  const confirmDelete = () =>
    Alert.alert("Move to trash?", "You can restore it from Trash in Settings.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to trash",
        style: "destructive",
        onPress: () =>
          void save(async () => {
            await beforeDelete?.();
            await deleteNote.mutateAsync();
            router.back();
          }),
      },
    ]);

  return (
    <Card>
      <AppText variant="heading">Details</AppText>
      <View style={{ gap: 8 }}>
        <AppText variant="label" tone="muted">
          Difficulty
        </AppText>
        <DifficultyPicker
          value={getDifficulty(note.tags)}
          onChange={(difficulty) => void save(() => setDifficulty.mutateAsync(difficulty))}
          disabled={setDifficulty.isPending}
        />
      </View>
      <Divider color={colors.border} />
      <View style={{ gap: 8 }}>
        <AppText variant="label" tone="muted">
          Tags
        </AppText>
        <TagPicker
          value={tagIds}
          onChange={(next) =>
            void save(() =>
              setTags.mutateAsync({
                add: next.filter((id) => !tagIds.includes(id)),
                remove: tagIds.filter((id) => !next.includes(id)),
              }),
            )
          }
        />
      </View>
      <Divider color={colors.border} />
      <SettingRow label="Project">
        <ProjectPicker
          value={note.project?.id ?? null}
          onChange={(projectId) => void save(() => setProject.mutateAsync(projectId))}
          disabled={setProject.isPending}
        />
      </SettingRow>
      <Divider color={colors.border} />
      <View style={{ gap: 8 }}>
        <AppText variant="label" tone="muted">
          Review
        </AppText>
        <ReviewStatusPicker
          value={status}
          onChange={(next) => void save(() => setReviewStatus.mutateAsync(next))}
          disabled={setReviewStatus.isPending}
        />
        <AppText variant="caption" tone="muted">
          {STATUS_HINTS[status]}
        </AppText>
      </View>
      {status === "active" && pending ? (
        <>
          <Divider color={colors.border} />
          <SettingRow label="Next review">
            <NextReviewPicker
              value={pending.remind_at}
              disabled={reschedule.isPending}
              onChange={(date) => void save(() => reschedule.mutateAsync(date))}
            />
          </SettingRow>
        </>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      <Button variant="destructive" onPress={confirmDelete} loading={deleteNote.isPending}>
        Move to trash
      </Button>
    </Card>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "error") return <HeaderTextButton label="Retry save" onPress={onRetry} />;
  const text =
    status === "saving" || status === "pending" ? "Saving…" : status === "saved" ? "Saved" : "";
  if (!text) return null;
  return (
    <AppText
      variant="caption"
      tone="muted"
      accessibilityLiveRegion="polite"
      style={{ paddingHorizontal: 8 }}
    >
      {text}
    </AppText>
  );
}

function NoteHeading({ note, children }: { note: NoteItem; children: ReactNode }) {
  const pending = pendingReminder(note);
  const label = dueLabel(note);
  return (
    <View style={{ gap: 10 }}>
      {children}
      <NoteMeta note={note} />
      <AppText variant="caption" tone={label.due ? "primary" : "muted"}>
        {label.text}
        {pending && !label.due && note.in_review && !note.paused_at
          ? ` · ${format(pending.remind_at, "EEE, MMM d")}`
          : ""}
      </AppText>
    </View>
  );
}

async function shareNote(note: NoteItem, beforeShare: () => Promise<void>) {
  try {
    await beforeShare();
    const markdown = await fetchNoteMarkdown(note.id);
    await Share.share({ message: markdown, title: noteTitle(note) });
  } catch (failure) {
    Alert.alert("Couldn’t share this note", errorText(failure));
  }
}

function EditableNote({ note, editor }: { note: NoteItem; editor: RichEditorController }) {
  const { colors } = useTheme();
  const { family } = useReadingFont();
  const autosave = useNoteAutosave(note);
  const navigation = useNavigation();
  const [sharing, setSharing] = useState(false);
  usePreventRemove(
    autosave.status === "pending" || autosave.status === "saving" || autosave.status === "error",
    ({ data }) => {
      void autosave.flush().then(
        () => navigation.dispatch(data.action),
        () =>
          Alert.alert(
            "Couldn’t save your changes",
            "Keep editing and retry, or leave without saving your last changes.",
            [
              { text: "Keep editing", style: "cancel" },
              {
                text: "Leave without saving",
                style: "destructive",
                onPress: () => navigation.dispatch(data.action),
              },
            ],
          ),
      );
    },
  );
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareNote({ ...note, name: autosave.name.trim() || note.name }, autosave.flush);
    } finally {
      setSharing(false);
    }
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {autosave.status === "idle" ? null : (
                <SaveIndicator status={autosave.status} onRetry={autosave.retry} />
              )}
              <HeaderButton
                ios="square.and.arrow.up"
                android="share"
                label="Share as Markdown"
                onPress={() => void share()}
                disabled={sharing}
              />
            </View>
          ),
        }}
      />
      <NoteHeading note={note}>
        <TextInput
          value={autosave.name}
          onChangeText={autosave.setName}
          placeholder="Untitled"
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          accessibilityLabel="Title"
          style={{
            color: colors.foreground,
            fontFamily: family.semibold,
            fontSize: 22,
            lineHeight: 29,
            padding: 0,
          }}
        />
      </NoteHeading>
      {autosave.status === "error" ? (
        <InlineError message="Couldn’t save your last changes. They’re still here; tap Retry save." />
      ) : null}
      <RichEditorBody
        controller={editor}
        markdown={note.content}
        placeholder="Tap to start writing"
        minHeight={120}
        onChange={autosave.setContent}
      />
      <NoteSettings note={note} beforeDelete={autosave.flush} />
    </>
  );
}

function NoteView({ note, live }: { note: NoteItem; live: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useReviewActions();
  const editor = useRichEditor();
  const { attachScroll, onScroll } = editor.bridge;
  const due = isDue(note);
  const intervals = useNoteIntervals(note, due);
  const showPanel =
    !editor.toolbarVisible && (due || actions.last !== null || actions.error !== null);

  const rate = (rating: Rating) => void actions.rate(note, rating);

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        ref={attachScroll}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={16}
        bottomOffset={TOOLBAR_HEIGHT + 16}
        extraKeyboardSpace={TOOLBAR_HEIGHT}
        contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 32 }}
      >
        {live ? (
          <EditableNote note={note} editor={editor} />
        ) : (
          <>
            <NoteHeading note={note}>
              <AppText variant="title" reading selectable>
                {noteTitle(note)}
              </AppText>
            </NoteHeading>
            <NoteBody markdown={note.content} />
          </>
        )}
        {!live ? <NoteSettings note={note} /> : null}
        <ReviewHistory note={note} />
      </KeyboardAwareScrollView>
      {showPanel ? (
        <View
          style={{
            gap: 10,
            paddingHorizontal: space.gutter,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: colors.shelf,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {actions.last ? (
            <UndoBar
              message={actions.last.message}
              onUndo={() => void actions.undo()}
              onTimeout={actions.dismiss}
              disabled={actions.pending}
            />
          ) : null}
          {actions.error ? <InlineError message={actions.error} /> : null}
          {due ? (
            <>
              <AppText variant="caption" tone="muted" style={{ textAlign: "center" }}>
                Due for review. How well did you remember it?
              </AppText>
              <RatingBar onRate={rate} disabled={actions.pending} intervals={intervals.data} />
            </>
          ) : null}
        </View>
      ) : null}
      <RichEditorToolbar controller={editor} />
    </View>
  );
}

export function NoteDetailScreen({ id }: { id: number }) {
  const query = useNote(id);

  if (query.data) return <NoteView key={id} note={query.data} live={!query.isPlaceholderData} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <LoadingState />;
}
