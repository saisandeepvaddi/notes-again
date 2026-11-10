import { z } from "zod";

export const PROVIDERS = [
  { value: "openai", label: "OpenAI", model: "gpt-4.1-mini" },
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5" },
] as const;

export const CredentialsSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  model: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.:/-]+$/),
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[\x21-\x7e]+$/),
});
export type Credentials = z.infer<typeof CredentialsSchema>;
export const DEFAULT_CREDENTIALS: Credentials = {
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKey: "",
};

export const ACTIONS = [
  {
    label: "Explain",
    question:
      "Explain the key ideas in this note in plain language. Cite the note as [1] and label any additional general knowledge separately.",
  },
  {
    label: "Summarize",
    question:
      "Summarize this note in five concise bullet points, citing [1]. Do not add facts not supported by the note.",
  },
  {
    label: "Quiz me",
    question:
      "Ask me three questions to test my understanding of this note [1]. Do not reveal the answers until I respond. Use only the note.",
  },
] as const;

export const ContextSchema = z.object({
  note_id: z.number().int(),
  note_uid: z.string(),
  title: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  limit: z.number().int(),
});
export type DiscussionContext = z.infer<typeof ContextSchema>;
const count = z.number().int().nonnegative().nullable();
export const EventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("context"),
    context: ContextSchema,
    provider: z.string(),
    model: z.string(),
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("usage"), input_tokens: count, output_tokens: count }),
  z.object({ type: z.literal("limit"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type DiscussionEvent = z.infer<typeof EventSchema>;
export interface Turn {
  id: string;
  question: string;
  answer: string;
  status: "streaming" | "done" | "stopped" | "error";
  context?: DiscussionContext;
  usage?: { input: number | null; output: number | null };
  notice?: string;
  provider: string;
  model: string;
}

export function historyFor(turns: Turn[]) {
  const messages = turns
    .filter((turn) => turn.status === "done")
    .slice(-3)
    .flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.answer },
    ]);
  while (messages.reduce((size, message) => size + Array.from(message.content).length, 0) > 8_000)
    messages.splice(0, 2);
  return messages;
}

export function answerAsNote(turn: Turn, title: string) {
  return {
    name: `Discussion: ${title || "Untitled note"}`.slice(0, 200),
    content: `---\nsource_note_uid: ${JSON.stringify(turn.context?.note_uid ?? "")}\nai_provider: ${JSON.stringify(turn.provider)}\nai_model: ${JSON.stringify(turn.model)}\n---\n\nSource [1]: ${title || "Note"}\n\nAI-generated answer; verify before relying on it.${turn.status !== "done" ? " This answer is incomplete." : ""}\n\n## Question\n\n${turn.question}\n\n## Answer\n\n${turn.answer}`,
    first_reminder_at: new Date(),
    difficulty: "medium" as const,
    tag_ids: [],
    project_id: null,
    in_review: false,
  };
}

export class EventDecoder {
  private buffer = "";
  private data: string[] = [];
  push(text: string): DiscussionEvent[] {
    this.buffer += text;
    if (this.buffer.length > 256_000)
      throw new Error("The discussion stream exceeded its size limit.");
    const events: DiscussionEvent[] = [];
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).replace(/\r$/, "");
      this.buffer = this.buffer.slice(index + 1);
      if (!line && this.data.length) {
        let value: unknown;
        try {
          value = JSON.parse(this.data.join("\n"));
        } catch {
          throw new Error("The server sent an unreadable discussion stream.");
        }
        this.data = [];
        const parsed = EventSchema.safeParse(value);
        if (!parsed.success) throw new Error("The server sent an unsupported discussion response.");
        events.push(parsed.data);
      } else if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
      if (this.data.reduce((size, value) => size + value.length, 0) > 256_000)
        throw new Error("The discussion stream exceeded its size limit.");
    }
    return events;
  }
}

export async function consumeDiscussion(
  response: Response,
  onEvent: (event: DiscussionEvent) => void,
) {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new Error(
      data && typeof data === "object" && "detail" in data && typeof data.detail === "string"
        ? data.detail.slice(0, 500)
        : `Discussion failed (${response.status}).`,
    );
  }
  if (!response.body) throw new Error("Streaming is unavailable on this device.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = new EventDecoder();
  let done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      const text = decoder.decode(chunk.value, { stream: !chunk.done });
      for (const event of events.push(text)) {
        onEvent(event);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") done = true;
      }
      if (done || chunk.done) break;
    }
    if (!done)
      throw new Error(
        "The discussion ended before the response finished. The partial answer has been kept.",
      );
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface DiscussionBody {
  provider: Credentials["provider"];
  model: string;
  api_key: string;
  question: string;
  history: ReturnType<typeof historyFor>;
}
