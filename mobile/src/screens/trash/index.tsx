import type { NoteItem } from "@web/notes/new-note-form/types";
import { formatDistanceToNowStrict } from "date-fns";
import { Stack } from "expo-router";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import { useDeleteForever, useEmptyTrash, useRestoreNote, useTrashedNotes } from "@/api/library";
import { ActionMenu } from "@/components/action-menu";
import { AppText } from "@/components/app-text";
import { HeaderTextButton } from "@/components/header-text-button";
import { ErrorState, LoadingState, MessageState } from "@/components/screen-state";
import { useTheme } from "@/hooks/use-theme";
import { radius, space } from "@/theme";
import { noteExcerpt, noteTitle } from "@/utils/note-format";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function TrashedRow({ note }: { note: NoteItem }) {
  const { colors } = useTheme();
  const restore = useRestoreNote();
  const deleteForever = useDeleteForever();
  const excerpt = noteExcerpt(note);
  const busy = restore.isPending || deleteForever.isPending;

  const run = (task: () => Promise<unknown>) =>
    void task().catch((error: unknown) => Alert.alert("Couldn’t do that", errorText(error)));

  const confirmDelete = () =>
    Alert.alert("Delete forever?", "This note and its review history can’t be recovered.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete forever",
        style: "destructive",
        onPress: () => run(() => deleteForever.mutateAsync(note.id)),
      },
    ]);

  return (
    <ActionMenu
      title={noteTitle(note)}
      items={[
        { id: "restore", title: "Restore" },
        { id: "delete", title: "Delete forever", destructive: true },
      ]}
      onSelect={(id) =>
        id === "restore" ? run(() => restore.mutateAsync(note.id)) : confirmDelete()
      }
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={noteTitle(note)}
        accessibilityHint="Restore or delete forever"
        style={{
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: colors.hairline,
          padding: 14,
          gap: 6,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <AppText variant="heading" reading numberOfLines={2}>
          {noteTitle(note)}
        </AppText>
        {excerpt ? (
          <AppText variant="caption" tone="muted" numberOfLines={2}>
            {excerpt}
          </AppText>
        ) : null}
        <AppText variant="label" tone="muted">
          Last edited {formatDistanceToNowStrict(note.updated_at, { addSuffix: true })}
        </AppText>
      </View>
    </ActionMenu>
  );
}

export function TrashScreen() {
  const { colors } = useTheme();
  const query = useTrashedNotes();
  const emptyTrash = useEmptyTrash();
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  const confirmEmpty = () =>
    Alert.alert(
      "Empty the trash?",
      `${total.toLocaleString()} ${total === 1 ? "note is" : "notes are"} deleted forever. This can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty trash",
          style: "destructive",
          onPress: () =>
            void emptyTrash
              .mutateAsync()
              .catch((error: unknown) => Alert.alert("Couldn’t empty the trash", errorText(error))),
        },
      ],
    );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight:
            total > 0
              ? () => (
                  <HeaderTextButton
                    label="Empty"
                    onPress={confirmEmpty}
                    loading={emptyTrash.isPending}
                  />
                )
              : undefined,
        }}
      />
      <FlatList<NoteItem>
        data={notes}
        keyExtractor={(note) => String(note.id)}
        renderItem={({ item }) => <TrashedRow note={item} />}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.gutter, gap: 10, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={() =>
          query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()
        }
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          total > 0 ? (
            <View style={{ marginBottom: 2 }}>
              <AppText variant="caption" tone="muted">
                Tap a note to restore it or delete it forever.
              </AppText>
            </View>
          ) : null
        }
        ListEmptyComponent={
          query.data ? (
            <MessageState title="Trash is empty" message="Notes you delete wait here." />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <LoadingState />
          )
        }
      />
    </>
  );
}
