import { getDifficulty } from "@web/notes/difficulty";
import type { NoteItem, Rating } from "@web/notes/new-note-form/types";
import { RATING_OPTIONS } from "@web/notes/rating";
import { format } from "date-fns";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  isDue,
  pendingReminder,
  useDeleteNote,
  useNote,
  useSetDifficulty,
  useSetPaused,
  useSetProject,
} from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DifficultyPicker } from "@/components/difficulty-picker";
import { HeaderButton } from "@/components/header-button";
import { NoteBody } from "@/components/note-body";
import { NoteMeta } from "@/components/note-meta";
import { ProjectPicker } from "@/components/project-picker";
import { RatingBar } from "@/components/rating-bar";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { Divider, SettingRow } from "@/components/setting-row";
import { UndoBar } from "@/components/undo-bar";
import { useReviewActions } from "@/hooks/use-review-actions";
import { useTheme } from "@/hooks/use-theme";
import { ratingTint, space } from "@/theme";
import { dueLabel, noteTitle } from "@/utils/note-format";

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

function NoteSettings({ note }: { note: NoteItem }) {
  const { colors } = useTheme();
  const router = useRouter();
  const setDifficulty = useSetDifficulty(note.id);
  const setProject = useSetProject(note.id);
  const setPaused = useSetPaused(note.id);
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
    Alert.alert("Move to trash?", "You can restore it from the trash on the web app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to trash",
        style: "destructive",
        onPress: () =>
          void save(async () => {
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
      <SettingRow label="Project">
        <ProjectPicker
          value={note.project?.id ?? null}
          onChange={(projectId) => void save(() => setProject.mutateAsync(projectId))}
          disabled={setProject.isPending}
        />
      </SettingRow>
      <Divider color={colors.border} />
      <SettingRow label="Pause reviews" description="Paused notes don’t come up for review.">
        <Switch
          value={note.paused_at !== null}
          onValueChange={(paused) => void save(() => setPaused.mutateAsync(paused))}
          disabled={setPaused.isPending}
          trackColor={{ true: colors.primary, false: colors.secondary }}
          thumbColor={process.env.EXPO_OS === "android" ? colors.card : undefined}
          ios_backgroundColor={colors.secondary}
        />
      </SettingRow>
      {error ? <InlineError message={error} /> : null}
      <Button variant="destructive" onPress={confirmDelete} loading={deleteNote.isPending}>
        Move to trash
      </Button>
    </Card>
  );
}

function NoteView({ note }: { note: NoteItem }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const actions = useReviewActions();
  const due = isDue(note);
  const pending = pendingReminder(note);
  const label = dueLabel(note);
  const showPanel = due || actions.last !== null || actions.error !== null;

  const rate = (rating: Rating) => void actions.rate(note, rating);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 32 }}
      >
        <View style={{ gap: 10 }}>
          <AppText variant="title" selectable>
            {noteTitle(note)}
          </AppText>
          <NoteMeta note={note} />
          <AppText variant="caption" tone={label.due ? "primary" : "muted"}>
            {label.text}
            {pending && !label.due && !note.paused_at
              ? ` · ${format(pending.remind_at, "EEE, MMM d")}`
              : ""}
          </AppText>
        </View>
        <NoteBody markdown={note.content} />
        <NoteSettings note={note} />
        <ReviewHistory note={note} />
      </ScrollView>
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
              <RatingBar onRate={rate} disabled={actions.pending} />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function NoteDetailScreen({ id }: { id: number }) {
  const router = useRouter();
  const query = useNote(id);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: query.data
            ? () => (
                <HeaderButton
                  ios="pencil"
                  android="edit"
                  label="Edit note"
                  onPress={() => router.push({ pathname: "/edit-note/[id]", params: { id } })}
                />
              )
            : undefined,
        }}
      />
      {query.data ? (
        <NoteView note={query.data} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <LoadingState />
      )}
    </>
  );
}
