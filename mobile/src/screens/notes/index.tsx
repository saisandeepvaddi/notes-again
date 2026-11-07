import { DIFFICULTY_OPTIONS } from "@web/notes/difficulty";
import type { Difficulty, NoteItem } from "@web/notes/new-note-form/types";
import { REVIEW_STATUS_LABELS } from "@web/notes/reviewStatus";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BulkChange, useBulkChange } from "@/api/library";
import {
  NOTES_SORTS,
  type NotesFilters,
  type NotesSort,
  useNotes,
  useProjects,
  useTags,
} from "@/api/notes";
import { ActionMenu, type MenuItem } from "@/components/action-menu";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { HeaderButton } from "@/components/header-button";
import { HeaderTextButton } from "@/components/header-text-button";
import { NoteRow } from "@/components/note-row";
import { ErrorState, LoadingState, MessageState } from "@/components/screen-state";
import { useDebounced } from "@/hooks/use-debounced";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius, space } from "@/theme";

type ListFilters = Omit<NotesFilters, "search">;

const DEFAULT_FILTERS: ListFilters = { projectId: null, tagId: null, status: null, sort: "due" };

function SortChip({ sort, onChange }: { sort: NotesSort; onChange: (sort: NotesSort) => void }) {
  const { colors } = useTheme();
  const label = NOTES_SORTS.find((option) => option.value === sort)?.label ?? "Due date";
  return (
    <ActionMenu
      title="Sort by"
      items={NOTES_SORTS.map((option) => ({
        id: option.value,
        title: option.label,
        checked: option.value === sort,
      }))}
      onSelect={(id) => onChange(id as NotesSort)}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${label}`}
        style={{
          minHeight: 36,
          paddingHorizontal: 14,
          justifyContent: "center",
          borderRadius: radius.full,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <AppText variant="label">↕ {label}</AppText>
      </View>
    </ActionMenu>
  );
}

function FilterChips({
  filters,
  onChange,
}: {
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
}) {
  const { colors } = useTheme();
  const { data: projects = [] } = useProjects();
  const { data: tags = [] } = useTags();
  const visibleProjects = projects.filter((project) => project.note_count > 0);
  const visibleTags = tags.filter((tag) => !tag.is_difficulty && tag.note_count > 0);
  const separator = (
    <View style={{ width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 }} />
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -space.gutter }}
      contentContainerStyle={{ paddingHorizontal: space.gutter, gap: 8, alignItems: "center" }}
    >
      <SortChip sort={filters.sort} onChange={(sort) => onChange({ ...filters, sort })} />
      <Chip
        label="All"
        selected={filters.projectId === null && filters.tagId === null && filters.status === null}
        onPress={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
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
      {visibleProjects.length > 0 ? separator : null}
      {visibleProjects.map((project) => (
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
      {visibleTags.length > 0 ? separator : null}
      {visibleTags.map((tag) => (
        <Chip
          key={tag.id}
          label={`#${tag.name}`}
          selected={filters.tagId === tag.id}
          onPress={() => onChange({ ...filters, tagId: filters.tagId === tag.id ? null : tag.id })}
        />
      ))}
    </ScrollView>
  );
}

const NO_PROJECT_ID = "project:none";

function SelectionBar({ selected, onDone }: { selected: number[]; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { data: projects = [] } = useProjects();
  const bulk = useBulkChange();
  const count = selected.length;

  const apply = (change: BulkChange) =>
    void bulk
      .mutateAsync({ noteIds: selected, change })
      .then(onDone)
      .catch((error: unknown) =>
        Alert.alert(
          "Couldn’t change those notes",
          error instanceof Error ? error.message : "Something went wrong",
        ),
      );

  const items: MenuItem[] = [
    {
      id: "project",
      title: "Move to project",
      children: [
        { id: NO_PROJECT_ID, title: "No project" },
        ...projects.map((project) => ({ id: `project:${project.id}`, title: project.name })),
      ],
    },
    {
      id: "difficulty",
      title: "Set difficulty",
      children: DIFFICULTY_OPTIONS.map((option) => ({
        id: `difficulty:${option.value}`,
        title: option.label,
      })),
    },
    { id: "pause", title: "Pause reviews" },
    { id: "resume", title: "Resume reviews" },
    { id: "remove-from-review", title: "Remove from review" },
    { id: "add-to-review", title: "Add to review" },
    { id: "delete", title: "Move to trash", destructive: true },
  ];

  const select = (id: string) => {
    if (id === NO_PROJECT_ID) return apply({ action: "project", projectId: null });
    if (id.startsWith("project:")) {
      return apply({ action: "project", projectId: Number(id.slice("project:".length)) });
    }
    if (id.startsWith("difficulty:")) {
      return apply({
        action: "difficulty",
        difficulty: id.slice("difficulty:".length) as Difficulty,
      });
    }
    if (id === "delete") {
      return Alert.alert(
        `Move ${count} ${count === 1 ? "note" : "notes"} to the trash?`,
        "You can restore them from Trash in Settings.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Move to trash",
            style: "destructive",
            onPress: () => apply({ action: "delete" }),
          },
        ],
      );
    }
    apply({ action: id as "pause" | "resume" | "remove-from-review" | "add-to-review" });
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: space.gutter,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        backgroundColor: colors.shelf,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <AppText variant="label" style={{ flex: 1 }}>
        {count === 0 ? "Tap notes to select them" : `${count} selected`}
      </AppText>
      {count > 0 ? (
        <ActionMenu title={`${count} selected`} items={items} onSelect={select}>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="Actions for the selected notes"
            style={{
              minHeight: 40,
              paddingHorizontal: 16,
              justifyContent: "center",
              borderRadius: radius.md,
              borderCurve: "continuous",
              backgroundColor: colors.primary,
              opacity: bulk.isPending ? 0.6 : 1,
            }}
          >
            <AppText
              style={{
                color: colors.primaryForeground,
                fontFamily: fonts.sansSemibold,
                fontSize: 15,
              }}
            >
              {bulk.isPending ? "Working…" : "Actions"}
            </AppText>
          </View>
        </ActionMenu>
      ) : null}
    </View>
  );
}

export function NotesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const debouncedSearch = useDebounced(search);
  const query = useNotes({ ...filters, search: debouncedSearch });
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const filtered =
    debouncedSearch.trim() !== "" ||
    filters.projectId !== null ||
    filters.tagId !== null ||
    filters.status !== null;

  const toggle = (id: number) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));

  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  const clear = () => {
    setSearch("");
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
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
          headerLeft: () =>
            notes.length > 0 || selecting ? (
              <HeaderTextButton
                label={selecting ? "Done" : "Select"}
                prominent={selecting}
                onPress={selecting ? stopSelecting : () => setSelecting(true)}
              />
            ) : null,
          headerRight: selecting
            ? undefined
            : () => (
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
        style={{ flex: 1 }}
        data={notes}
        keyExtractor={(note) => String(note.id)}
        extraData={selecting ? selected : null}
        renderItem={({ item }) =>
          selecting ? (
            <NoteRow note={item} selected={selected.includes(item.id)} onToggle={toggle} />
          ) : (
            <NoteRow note={item} />
          )
        }
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
      {selecting ? <SelectionBar selected={selected} onDone={stopSelecting} /> : null}
    </>
  );
}
