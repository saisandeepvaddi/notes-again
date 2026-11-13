import { useState } from "react";
import { FlatList, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useNotes } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { ErrorState, LoadingState } from "@/components/screen-state";
import { TextField } from "@/components/text-field";
import { setPendingLink } from "@/links/pending";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";
import { noteExcerpt, noteTitle } from "@/utils/note-format";

export function LinkNoteScreen({ sourceId }: { sourceId: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const notes = useNotes({ search: query, projectId: null, tagId: null, status: null, sort: "created" });
  const items = (notes.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (note) => note.id !== sourceId && note.uid,
  );
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.gutter, gap: 8, paddingBottom: 40 }}
      data={items}
      keyExtractor={(note) => String(note.id)}
      onEndReached={() => notes.hasNextPage && void notes.fetchNextPage()}
      ListHeaderComponent={
        <TextField
          autoFocus
          placeholder="Search notes to link"
          accessibilityLabel="Search notes to link"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
      }
      ListEmptyComponent={
        notes.error ? (
          <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />
        ) : notes.isPending ? (
          <LoadingState />
        ) : (
          <AppText tone="muted">No matching notes.</AppText>
        )
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPendingLink({ title: noteTitle(item), uid: item.uid ?? "" });
            router.back();
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingVertical: 10,
            gap: 2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <AppText numberOfLines={1}>{noteTitle(item)}</AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {noteExcerpt(item)}
          </AppText>
        </Pressable>
      )}
    />
  );
}
