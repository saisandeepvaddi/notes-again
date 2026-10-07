import { NotePageSchema, type NoteItem, type NotePage } from "@web/notes/new-note-form/types";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import { DUE_PAGE_SIZE } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { NoteBody } from "@/components/note-body";
import { NoteMeta } from "@/components/note-meta";
import { RatingBar } from "@/components/rating-bar";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { UndoBar } from "@/components/undo-bar";
import { useReviewActions } from "@/hooks/use-review-actions";
import { useTheme } from "@/hooks/use-theme";
import { fonts, space } from "@/theme";
import { noteTitle } from "@/utils/note-format";

function ReviewHeader({ left, reviewed }: { left: number | null; reviewed: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const progress = left === null || left + reviewed === 0 ? 0 : reviewed / (left + reviewed);

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", height: 52, paddingHorizontal: 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="End review"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon ios="xmark" android="close" color={colors.foreground} />
        </Pressable>
        <AppText
          style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansSemibold, fontSize: 17 }}
        >
          Review
        </AppText>
        <View style={{ width: 72, alignItems: "flex-end", paddingRight: 8 }}>
          {left !== null ? (
            <AppText variant="label" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
              {left.toLocaleString()} left
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={{ height: 3, backgroundColor: colors.secondary }}>
        <View
          style={{
            height: 3,
            width: `${Math.round(progress * 100)}%`,
            backgroundColor: colors.primary,
          }}
        />
      </View>
    </View>
  );
}

function SessionDone({ reviewed }: { reviewed: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 }}>
      <Icon ios="checkmark.circle.fill" android="check_circle" size={44} color={colors.primary} />
      <AppText variant="title" style={{ textAlign: "center" }}>
        {reviewed > 0 ? "Session complete" : "All caught up"}
      </AppText>
      <AppText tone="muted" style={{ textAlign: "center" }}>
        {reviewed > 0
          ? `Reviewed ${reviewed.toLocaleString()} ${reviewed === 1 ? "note" : "notes"}. Nothing else is due right now.`
          : "Nothing’s due right now. Check back later."}
      </AppText>
      <Button style={{ marginTop: 12, alignSelf: "stretch" }} onPress={() => router.back()}>
        Done
      </Button>
    </View>
  );
}

function Session({ initial, total }: { initial: NoteItem[]; total: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState(initial);
  const [remaining, setRemaining] = useState(total);
  const [reviewed, setReviewed] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const actions = useReviewActions();
  const current = queue[0];

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await api(NotePageSchema, `/notes/due?limit=${DUE_PAGE_SIZE}`);
      setQueue(page.items);
      setRemaining(page.total);
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : "Couldn't load more notes");
    } finally {
      setLoadingMore(false);
    }
  };

  const rate = async (rating: Parameters<typeof actions.rate>[1]) => {
    if (!current) return;
    if (!(await actions.rate(current, rating))) return;
    const rest = queue.slice(1);
    const left = remaining - 1;
    setReviewed((count) => count + 1);
    setQueue(rest);
    setRemaining(left);
    if (rest.length === 0 && left > 0) {
      await loadMore();
    } else if (left <= 0 && process.env.EXPO_OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const undo = async () => {
    const restored = await actions.undo();
    if (!restored) return;
    setQueue((notes) => [restored, ...notes.filter((note) => note.id !== restored.id)]);
    setRemaining((count) => count + 1);
    setReviewed((count) => Math.max(0, count - 1));
  };

  const footer = (
    <>
      {actions.last ? (
        <UndoBar
          message={actions.last.message}
          onUndo={() => void undo()}
          onTimeout={actions.dismiss}
          disabled={actions.pending}
        />
      ) : null}
      {actions.error ? <InlineError message={actions.error} /> : null}
    </>
  );

  let body;
  if (loadingMore) {
    body = <LoadingState label="Loading the next batch…" />;
  } else if (loadError) {
    body = <ErrorState error={new Error(loadError)} onRetry={() => void loadMore()} />;
  } else if (!current) {
    body = <SessionDone reviewed={reviewed} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ReviewHeader left={current ? remaining : 0} reviewed={reviewed} />
      {body ?? (
        <ScrollView
          key={current.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: space.gutter, paddingBottom: 24, gap: 14 }}
        >
          <AppText variant="title" reading selectable>
            {noteTitle(current)}
          </AppText>
          <NoteMeta note={current} />
          <NoteBody markdown={current.content} />
        </ScrollView>
      )}
      <View
        style={{
          gap: 10,
          paddingHorizontal: space.gutter,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          backgroundColor: current && !body ? colors.shelf : colors.background,
          borderTopWidth: current && !body ? 1 : 0,
          borderTopColor: colors.border,
        }}
      >
        {footer}
        {current && !body ? (
          <>
            <AppText variant="caption" tone="muted" style={{ textAlign: "center" }}>
              How well did you remember this?
            </AppText>
            <RatingBar onRate={(rating) => void rate(rating)} disabled={actions.pending} />
          </>
        ) : null}
      </View>
    </View>
  );
}

export function ReviewScreen() {
  const { colors } = useTheme();
  const [start, setStart] = useState<NotePage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api(NotePageSchema, `/notes/due?limit=${DUE_PAGE_SIZE}`)
      .then((page) => !cancelled && setStart(page))
      .catch((failure: unknown) => !cancelled && setError(failure));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt((count) => count + 1);
  };

  if (!start) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ReviewHeader left={null} reviewed={0} />
        {error ? <ErrorState error={error} onRetry={retry} /> : <LoadingState />}
      </View>
    );
  }

  return <Session initial={start.items} total={start.total} />;
}
