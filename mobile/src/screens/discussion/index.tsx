import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useDiscussion } from "@web/discussion/useDiscussion";
import { ACTIONS, answerAsNote, type DiscussionBody, type Turn } from "@web/discussion/core";
import { streamRequest } from "@/api/client";
import { useCreateNote, useNote } from "@/api/notes";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState, InlineError, LoadingState } from "@/components/screen-state";
import { TextField } from "@/components/text-field";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";
import { noteTitle } from "@/utils/note-format";
import { useDiscussionCredentials } from "@/discussion/credentials";

export function DiscussionScreen({ id }: { id: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const note = useNote(id);
  const credentials = useDiscussionCredentials();
  const transport = useCallback(
    (body: DiscussionBody, signal: AbortSignal) =>
      streamRequest(`/notes/${id}/discuss`, body, signal),
    [id],
  );
  const chat = useDiscussion(transport);
  const stopChat = chat.stop;
  const [contextOpen, setContextOpen] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createNote = useCreateNote();
  useFocusEffect(useCallback(() => () => stopChat(), [stopChat]));
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopChat();
    });
    return () => listener.remove();
  }, [stopChat]);
  if (!note.data)
    return note.error ? (
      <ErrorState error={note.error} onRetry={() => void note.refetch()} />
    ) : (
      <LoadingState />
    );
  const title = noteTitle(note.data);

  const saveAnswer = (turn: Turn) =>
    Alert.alert(
      "Save this answer as a new note?",
      "Creates a separate Note only with the question, answer and stable source identifier. The original note and schedule are unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create note",
          onPress: () => {
            if (createNote.isPending) return;
            setSaveError(null);
            const draft = answerAsNote(turn, turn.context?.title || title);
            void createNote
              .mutateAsync({
                name: draft.name,
                content: draft.content,
                difficulty: "medium",
                projectId: null,
                tagIds: [],
                status: "note-only",
              })
              .then(
                () => Alert.alert("Saved", "The answer is now a Note only in your library."),
                () =>
                  setSaveError(
                    "Could not save the answer. It is still in this discussion; you can try again.",
                  ),
              );
          },
        },
      ],
    );

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: space.gutter, gap: 20, paddingBottom: 40 }}
    >
      <AppText variant="heading" selectable>
        {title}
      </AppText>
      <AppText variant="caption" tone="muted" selectable>
        Only this saved note (up to 12,000 characters), your question and up to three recent
        completed exchanges go to{" "}
        {credentials.config.provider === "anthropic" ? "Anthropic" : "OpenAI"} through your Notes
        Again backend. Charges and provider data policies apply. Your library is not sent.
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          variant="outline"
          disabled={chat.running}
          onPress={() => router.push("/discuss-settings")}
        >
          Discuss settings
        </Button>
        <Button variant="ghost" disabled={chat.running || !chat.turns.length} onPress={chat.clear}>
          New discussion
        </Button>
      </View>
      {!credentials.config.apiKey && (
        <AppText tone="muted">
          Set your provider, model and key in Discuss settings before sending.
        </AppText>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ACTIONS.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            disabled={chat.running}
            onPress={() => chat.setQuestion(action.question)}
          >
            {action.label}
          </Button>
        ))}
      </View>
      {!chat.turns.length && (
        <AppText tone="muted">
          Choose a suggestion or ask a question, then Send. AI can make mistakes; verify answers
          against your note.
        </AppText>
      )}
      {chat.turns.map((turn) => (
        <Card key={turn.id}>
          <AppText variant="heading" selectable>
            {turn.question}
          </AppText>
          <AppText reading selectable>
            {turn.answer ||
              (turn.status === "streaming"
                ? "Waiting for the provider…"
                : "No answer text received.")}
          </AppText>
          <AppText variant="caption" tone="muted" selectable>
            {turn.provider} · {turn.model}
            {turn.status === "streaming"
              ? " · Responding…"
              : turn.status !== "done"
                ? " · Incomplete answer"
                : ""}
            {turn.usage
              ? ` · ${turn.usage.input ?? "—"} input / ${turn.usage.output ?? "—"} output tokens`
              : ""}
          </AppText>
          {turn.notice && (
            <AppText variant="caption" tone="muted" selectable>
              {turn.notice}
            </AppText>
          )}
          {turn.context && (
            <>
              <Button
                variant="ghost"
                onPress={() => setContextOpen(contextOpen === turn.id ? null : turn.id)}
              >
                {contextOpen === turn.id
                  ? "Hide sent context"
                  : `Context sent${turn.context.truncated ? " · truncated" : ""}`}
              </Button>
              {contextOpen === turn.id && (
                <AppText variant="caption" selectable>
                  {turn.context.content}
                </AppText>
              )}
            </>
          )}
          <Button
            variant="ghost"
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace({ pathname: "/note/[id]", params: { id } })
            }
          >
            Source [1]: {turn.context?.title || title}
          </Button>
          {!!turn.answer && turn.status !== "streaming" && (
            <Button
              variant="outline"
              disabled={chat.running || createNote.isPending}
              onPress={() => saveAnswer(turn)}
            >
              Save answer as note
            </Button>
          )}
        </Card>
      ))}
      {(chat.error || saveError) && (
        <InlineError message={chat.error || saveError || "Could not complete the request."} />
      )}
      <TextField
        label="Your question"
        accessibilityLabel="Discussion question"
        value={chat.question}
        onChangeText={chat.setQuestion}
        multiline
        maxLength={2_000}
        editable={!chat.running}
        style={{ minHeight: 100, textAlignVertical: "top" }}
      />
      {chat.running ? (
        <Button variant="outline" onPress={chat.stop}>
          Stop response
        </Button>
      ) : (
        <Button
          onPress={() => void chat.send()}
          disabled={!credentials.ready || !credentials.config.apiKey || !chat.question.trim()}
        >
          Send to provider
        </Button>
      )}
      <AppText variant="caption" tone="muted" selectable>
        Up to 1,200 output tokens per response. No automatic retries. Conversation stays in memory
        while this screen is open; save an answer explicitly to keep it.
      </AppText>
    </KeyboardAwareScrollView>
  );
}
