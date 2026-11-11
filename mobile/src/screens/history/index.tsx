import { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { hasChanges, lineDiff } from "@web/revisions/lineDiff";
import { useNote } from "@/api/notes";
import { useRestoreRevision, useRevision, useRevisionList } from "@/api/revisions";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const stamp = (value: string) => {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

function Compare({ id, revisionId, name, content }: { id: number; revisionId: number; name: string; content: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  const revision = useRevision(id, revisionId);
  const restore = useRestoreRevision(id);
  const diff = useMemo(
    () => (revision.data ? lineDiff(revision.data.content, content) : []),
    [revision.data, content],
  );
  if (!revision.data)
    return revision.error ? (
      <InlineError message="Could not load this version." />
    ) : (
      <LoadingState />
    );
  const titleChanged = revision.data.name !== name;
  const changed = titleChanged || hasChanges(diff);
  const confirm = () =>
    Alert.alert(
      "Restore this version?",
      "Your current text is kept in History first, so you can undo this.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () =>
            restore.mutate(revisionId, {
              onSuccess: () =>
                router.dismissTo({
                  pathname: "/note/[id]",
                  params: { id, r: String(Date.now()) },
                }),
            }),
        },
      ],
    );
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="caption" tone="muted">
        Compared with the current note. Red lines are only in this version; green lines are only in
        the current note.
      </AppText>
      {titleChanged && (
        <AppText variant="caption" selectable>
          Title then: {revision.data.name || "Untitled"}
        </AppText>
      )}
      {changed ? (
        <Card>
          {diff.map((line, index) =>
            line.kind === "same" ? (
              <AppText key={index} variant="caption" tone="muted" selectable>
                {line.text || " "}
              </AppText>
            ) : (
              <AppText
                key={index}
                variant="caption"
                selectable
                style={{
                  backgroundColor: line.kind === "added" ? colors.primaryTint : colors.destructiveTint,
                }}
              >
                {line.kind === "added" ? "+ " : "− "}
                {line.text || " "}
              </AppText>
            ),
          )}
        </Card>
      ) : (
        <AppText tone="muted">This version matches the current note.</AppText>
      )}
      {restore.error && <InlineError message="Could not restore this version." />}
      <Button disabled={!changed || restore.isPending} onPress={confirm}>
        Restore this version
      </Button>
    </View>
  );
}

export function HistoryScreen({ id }: { id: number }) {
  const { colors } = useTheme();
  const note = useNote(id);
  const list = useRevisionList(id);
  const [selected, setSelected] = useState<number | null>(null);
  if (!note.data || !list.data)
    return note.error || list.error ? (
      <ErrorState
        error={note.error ?? list.error!}
        onRetry={() => {
          void note.refetch();
          void list.refetch();
        }}
      />
    ) : (
      <LoadingState />
    );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 40 }}
    >
      <AppText variant="caption" tone="muted">
        Earlier versions of this note on this device, newest first. History is not synced between
        devices.
      </AppText>
      {!list.data.length && <AppText tone="muted">No earlier versions yet.</AppText>}
      {list.data.map((item) => (
        <Card key={item.id}>
          <AppText selectable>{stamp(item.created_at)}</AppText>
          <AppText variant="caption" tone="muted" selectable>
            {item.name || "Untitled"} · {item.characters} characters
          </AppText>
          <Button
            variant="outline"
            onPress={() => setSelected(selected === item.id ? null : item.id)}
          >
            {selected === item.id ? "Hide comparison" : "Compare"}
          </Button>
          {selected === item.id && (
            <Compare id={id} revisionId={item.id} name={note.data.name} content={note.data.content} />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}
