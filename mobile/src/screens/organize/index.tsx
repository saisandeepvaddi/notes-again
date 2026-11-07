import { useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import {
  type GroupAction,
  type GroupKind,
  useCreateProject,
  useDeleteGroup,
  useDeleteUnusedTags,
  useGroupAction,
} from "@/api/library";
import { useProjects, useTags } from "@/api/notes";
import { type MenuItem, ActionMenu } from "@/components/action-menu";
import { AppText } from "@/components/app-text";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { ErrorState, InlineError, LoadingState, MessageState } from "@/components/screen-state";
import { TextField } from "@/components/text-field";
import { useTheme } from "@/hooks/use-theme";
import { radius, space } from "@/theme";

interface Group {
  id: number;
  name: string;
  note_count: number;
  paused_count: number;
  note_only_count: number;
  paused?: boolean;
}

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function counts(group: Group) {
  const parts = [
    `${group.note_count.toLocaleString()} ${group.note_count === 1 ? "note" : "notes"}`,
  ];
  if (group.paused_count > 0) parts.push(`${group.paused_count.toLocaleString()} paused`);
  if (group.note_only_count > 0) parts.push(`${group.note_only_count.toLocaleString()} note only`);
  return parts.join(" · ");
}

function GroupRow({ kind, group }: { kind: GroupKind; group: Group }) {
  const { colors } = useTheme();
  const groupAction = useGroupAction();
  const deleteGroup = useDeleteGroup();
  const busy = groupAction.isPending || deleteGroup.isPending;
  const label = kind === "projects" ? group.name : `#${group.name}`;
  const noun = kind === "projects" ? "project" : "tag";

  const run = (action: GroupAction) =>
    void groupAction
      .mutateAsync({ kind, id: group.id, action })
      .catch((error: unknown) => Alert.alert("Couldn’t do that", errorText(error)));

  const remove = (deleteNotes: boolean) =>
    void deleteGroup
      .mutateAsync({ kind, id: group.id, deleteNotes })
      .catch((error: unknown) => Alert.alert(`Couldn’t delete the ${noun}`, errorText(error)));

  const confirmDelete = () =>
    Alert.alert(
      `Delete ${label}?`,
      group.note_count > 0
        ? `Its ${group.note_count === 1 ? "note" : `${group.note_count} notes`} can stay, or go to the trash with it.`
        : undefined,
      [
        { text: "Cancel", style: "cancel" },
        ...(group.note_count > 0
          ? [
              { text: "Delete, keep notes", onPress: () => remove(false) },
              {
                text: "Delete with notes",
                style: "destructive" as const,
                onPress: () => remove(true),
              },
            ]
          : [{ text: "Delete", style: "destructive" as const, onPress: () => remove(false) }]),
      ],
    );

  const active = group.note_count - group.paused_count - group.note_only_count;
  const reviewing = group.note_count - group.note_only_count;
  const items: MenuItem[] = [
    ...(active > 0 || (kind === "projects" && !group.paused)
      ? [{ id: "pause", title: "Pause reviews" }]
      : []),
    ...(group.paused_count > 0 || group.paused ? [{ id: "resume", title: "Resume reviews" }] : []),
    ...(reviewing > 0 ? [{ id: "remove-from-review", title: "Remove from review" }] : []),
    ...(group.note_only_count > 0 ? [{ id: "add-to-review", title: "Add to review" }] : []),
    { id: "delete", title: `Delete ${noun}…`, destructive: true },
  ];

  return (
    <ActionMenu
      title={label}
      items={items}
      onSelect={(id) => (id === "delete" ? confirmDelete() : run(id as GroupAction))}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${counts(group)}`}
        accessibilityHint={`Pause, resume or delete this ${noun}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          minHeight: 56,
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: colors.hairline,
          paddingHorizontal: 14,
          paddingVertical: 10,
          opacity: busy ? 0.5 : 1,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label" style={{ fontSize: 15, lineHeight: 20 }} numberOfLines={1}>
            {label}
          </AppText>
          <AppText variant="caption" tone="muted">
            {counts(group)}
          </AppText>
        </View>
        {group.paused ? <Badge label="Paused" /> : null}
      </View>
    </ActionMenu>
  );
}

function NewProject() {
  const createProject = useCreateProject();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await createProject.mutateAsync(name.trim());
      setName("");
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="New project"
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => void add()}
          />
        </View>
        <Button
          variant="secondary"
          onPress={() => void add()}
          disabled={!name.trim()}
          loading={createProject.isPending}
        >
          Add
        </Button>
      </View>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}

function UnusedTags() {
  const deleteUnused = useDeleteUnusedTags();
  const confirm = () =>
    Alert.alert("Delete unused tags?", "Removes every tag that no note carries.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete unused",
        style: "destructive",
        onPress: () =>
          void deleteUnused
            .mutateAsync()
            .then((result) =>
              Alert.alert(
                result.tags_deleted === 0
                  ? "No unused tags"
                  : `Deleted ${result.tags_deleted} ${result.tags_deleted === 1 ? "tag" : "tags"}`,
              ),
            )
            .catch((error: unknown) => Alert.alert("Couldn’t delete tags", errorText(error))),
      },
    ]);
  return (
    <Button variant="outline" size="sm" onPress={confirm} loading={deleteUnused.isPending}>
      Delete unused tags
    </Button>
  );
}

export function OrganizeScreen() {
  const { colors } = useTheme();
  const [kind, setKind] = useState<GroupKind>("projects");
  const projects = useProjects();
  const tags = useTags();
  const query = kind === "projects" ? projects : tags;
  const groups: Group[] =
    kind === "projects"
      ? (projects.data ?? [])
      : (tags.data ?? []).filter((tag) => !tag.is_difficulty);

  return (
    <FlatList<Group>
      data={groups}
      keyExtractor={(group) => `${kind}-${group.id}`}
      renderItem={({ item }) => <GroupRow kind={kind} group={item} />}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.gutter, gap: 10, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 2 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip
              label="Projects"
              selected={kind === "projects"}
              onPress={() => setKind("projects")}
            />
            <Chip label="Tags" selected={kind === "tags"} onPress={() => setKind("tags")} />
          </View>
          {kind === "projects" ? <NewProject /> : <UnusedTags />}
          {groups.length > 0 ? (
            <AppText variant="caption" tone="muted">
              Tap a {kind === "projects" ? "project" : "tag"} to pause, resume or delete it.
            </AppText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        query.data ? (
          <MessageState
            title={kind === "projects" ? "No projects yet" : "No tags yet"}
            message={
              kind === "projects"
                ? "Group notes into projects to review or pause them together."
                : "Add tags to notes from the note screen."
            }
          />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}
