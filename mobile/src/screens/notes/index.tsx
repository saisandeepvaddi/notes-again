import type { NoteItem } from "@web/notes/new-note-form/types";
import { REVIEW_STATUS_LABELS } from "@web/notes/reviewStatus";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useNotes, useProjects, type NotesFilters } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { HeaderButton } from "@/components/header-button";
import { NoteRow } from "@/components/note-row";
import { ErrorState, LoadingState, MessageState } from "@/components/screen-state";
import { useDebounced } from "@/hooks/use-debounced";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

function FilterChips({
  filters,
  onChange,
}: {
  filters: Omit<NotesFilters, "search">;
  onChange: (next: Omit<NotesFilters, "search">) => void;
}) {
  const { colors } = useTheme();
  const { data: projects = [] } = useProjects();
  const visible = projects.filter((project) => project.note_count > 0);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.gutter }}
      contentContainerStyle={{ paddingHorizontal: space.gutter, gap: 8, alignItems: "center" }}
    >
      <Chip
        label="All"
        selected={filters.projectId === null && filters.status === null}
        onPress={() => onChange({ projectId: null, status: null })}
      />
      {(["paused", "note-only"] as const).map((status) => (
        <Chip
          key={status}
          label={REVIEW_STATUS_LABELS[status]}
          selected={filters.status === status}
          onPress={() =>
            onChange({ ...filters, status: filters.status === status ? null : status })
          }
        />
      ))}
      {visible.length > 0 ? (
        <View
          style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 }}
        />
      ) : null}
      {visible.map((project) => (
        <Chip
          key={project.id}
          label={project.name}
          selected={filters.projectId === project.id}
          onPress={() =>
            onChange({
              ...filters,
              projectId: filters.projectId === project.id ? null : project.id,
            })
          }
        />
      ))}
    </ScrollView>
  );
}

export function NotesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Omit<NotesFilters, "search">>({
    projectId: null,
    status: null,
  });
  const debouncedSearch = useDebounced(search);
  const query = useNotes({ ...filters, search: debouncedSearch });
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filtered =
    debouncedSearch.trim() !== "" || filters.projectId !== null || filters.status !== null;

  const clear = () => {
    setSearch("");
    setFilters({ projectId: null, status: null });
  };

  return (
    <>
      <Stack.SearchBar
        placeholder="Search notes"
        onChangeText={(event) => setSearch(event.nativeEvent.text)}
        onCancelButtonPress={() => setSearch("")}
        autoCapitalize="none"
        tintColor={colors.primary}
        textColor={colors.foreground}
        hideWhenScrolling={false}
      />
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderButton
              ios="square.and.pencil"
              android="edit_square"
              label="New note"
              onPress={() => router.push("/new-note")}
            />
          ),
        }}
      />
      <FlatList<NoteItem>
        data={notes}
        keyExtractor={(note) => String(note.id)}
        renderItem={({ item }) => <NoteRow note={item} />}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
          <View style={{ gap: 12, marginBottom: 2 }}>
            <FilterChips filters={filters} onChange={setFilters} />
            {query.data && total > 0 ? (
              <AppText variant="caption" tone="muted">
                {total.toLocaleString()} {total === 1 ? "note" : "notes"}
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          query.data ? (
            filtered ? (
              <MessageState
                title="No matching notes"
                message="Try a different search or filter."
                action={
                  <Button variant="outline" size="sm" onPress={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <MessageState
                title="No notes yet"
                message="Write your first note and it’ll come back for review on schedule."
                action={
                  <Button size="sm" onPress={() => router.push("/new-note")}>
                    Write a note
                  </Button>
                }
              />
            )
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <LoadingState />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? <LoadingState label="Loading more…" /> : null
        }
      />
    </>
  );
}
