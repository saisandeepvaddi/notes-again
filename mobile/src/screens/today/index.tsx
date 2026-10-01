import type { NoteItem } from "@web/notes/new-note-form/types";
import { Stack, useRouter } from "expo-router";
import { FlatList, RefreshControl, View } from "react-native";
import { useDueNotes } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { HeaderButton } from "@/components/header-button";
import { Icon } from "@/components/icon";
import { NoteRow } from "@/components/note-row";
import { ErrorState, LoadingState } from "@/components/screen-state";
import { useTheme } from "@/hooks/use-theme";
import { fonts, space } from "@/theme";

function DueSummary({ total }: { total: number }) {
  const { colors } = useTheme();
  const router = useRouter();

  if (total === 0) {
    return (
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <Icon ios="checkmark.circle.fill" android="check_circle" size={34} color={colors.primary} />
        <AppText variant="title">All caught up</AppText>
        <AppText tone="muted" style={{ textAlign: "center" }}>
          Nothing’s due right now. Check back later.
        </AppText>
        <Button variant="secondary" onPress={() => router.push("/new-note")}>
          Write a note
        </Button>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 16 }}>
      <View style={{ gap: 2 }}>
        <AppText
          style={{
            fontFamily: fonts.serifSemibold,
            fontSize: 48,
            lineHeight: 54,
            fontVariant: ["tabular-nums"],
          }}
        >
          {total.toLocaleString()}
        </AppText>
        <AppText tone="muted">
          {total === 1 ? "note is due for review" : "notes are due for review"}
        </AppText>
      </View>
      <Button
        size="lg"
        haptic
        onPress={() => router.push("/review")}
        icon={
          <Icon ios="play.fill" android="play_arrow" size={16} color={colors.primaryForeground} />
        }
      >
        Start review
      </Button>
    </Card>
  );
}

export function TodayScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const query = useDueNotes();
  const notes = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <>
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
        data={query.data ? notes : []}
        keyExtractor={(note) => String(note.id)}
        renderItem={({ item }) => <NoteRow note={item} />}
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
          query.data ? (
            <View style={{ gap: 20, marginBottom: notes.length > 0 ? 2 : 0 }}>
              <DueSummary total={total} />
              {notes.length > 0 ? <AppText variant="heading">Due now</AppText> : null}
            </View>
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
