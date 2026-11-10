import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerHtml } from "../src/discussion/answerHtml";
import {
  answerAsNote,
  consumeDiscussion,
  EventDecoder,
  historyFor,
  type DiscussionEvent,
  type Turn,
} from "../src/discussion/core";

const context = {
  note_id: 1,
  note_uid: "uid-1",
  title: "T",
  content: "c",
  truncated: false,
  limit: 12000,
};
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;

function responseOf(chunks: Uint8Array[], init: ResponseInit = {}) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { status: 200, ...init });
}
const encode = (text: string) => new TextEncoder().encode(text);

async function collect(response: Response) {
  const events: DiscussionEvent[] = [];
  let error: Error | null = null;
  try {
    await consumeDiscussion(response, (event) => events.push(event));
  } catch (failure) {
    error = failure as Error;
  }
  return { events, error };
}

describe("EventDecoder", () => {
  it("reassembles frames split at any byte", () => {
    const text = frame({ type: "delta", text: "hello" }) + frame({ type: "done" });
    for (let at = 1; at < text.length; at++) {
      const decoder = new EventDecoder();
      const events = [...decoder.push(text.slice(0, at)), ...decoder.push(text.slice(at))];
      expect(events.map((event) => event.type)).toEqual(["delta", "done"]);
    }
  });

  it("handles CRLF and rejects malformed or unknown events", () => {
    expect(new EventDecoder().push('data: {"type":"done"}\r\n\r\n')).toHaveLength(1);
    expect(() => new EventDecoder().push("data: {nope\n\n")).toThrow(/unreadable/);
    expect(() => new EventDecoder().push(frame({ type: "surprise" }))).toThrow(/unsupported/);
  });

  it("refuses oversized streams", () => {
    expect(() => new EventDecoder().push("x".repeat(256_001))).toThrow(/size limit/);
  });
});

describe("consumeDiscussion", () => {
  it("decodes multibyte text split across network chunks", async () => {
    const bytes = encode(frame({ type: "delta", text: "héllo 😀" }) + frame({ type: "done" }));
    const split = bytes.indexOf(0xc3) + 1;
    const { events, error } = await collect(
      responseOf([bytes.slice(0, split), bytes.slice(split)]),
    );
    expect(error).toBeNull();
    expect(events[0]).toEqual({ type: "delta", text: "héllo 😀" });
  });

  it("keeps partial events but fails when the stream ends unfinished", async () => {
    const { events, error } = await collect(
      responseOf([encode(frame({ type: "delta", text: "part" }))]),
    );
    expect(events).toHaveLength(1);
    expect(error?.message).toMatch(/ended before/);
  });

  it("raises provider error events after delivering earlier text", async () => {
    const body =
      frame({ type: "delta", text: "a" }) + frame({ type: "error", message: "interrupted" });
    const { events, error } = await collect(responseOf([encode(body)]));
    expect(events.map((event) => event.type)).toEqual(["delta", "error"]);
    expect(error?.message).toBe("interrupted");
  });

  it("surfaces bounded server error details and generic statuses", async () => {
    const detail = await collect(
      new Response(JSON.stringify({ detail: "d".repeat(900) }), { status: 400 }),
    );
    expect(detail.error?.message).toHaveLength(500);
    const plain = await collect(new Response("nope", { status: 502 }));
    expect(plain.error?.message).toBe("Discussion failed (502).");
  });

  it("rejects malformed streams", async () => {
    const { error } = await collect(responseOf([encode("data: {bad\n\n")]));
    expect(error?.message).toMatch(/unreadable/);
  });

  it("stops reading after done", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode(frame({ type: "done" })));
      },
      cancel,
    });
    const { error } = await collect(new Response(stream));
    expect(error).toBeNull();
    expect(cancel).toHaveBeenCalled();
  });
});

const turn = (id: number, status: Turn["status"], size = 10): Turn => ({
  id: String(id),
  question: `q${id}`,
  answer: "a".repeat(size),
  status,
  provider: "openai",
  model: "m",
});

describe("historyFor", () => {
  it("keeps only the last three completed pairs", () => {
    const turns = [1, 2, 3, 4, 5].map((n) => turn(n, "done"));
    turns.splice(2, 0, turn(9, "error"), turn(8, "stopped"));
    const history = historyFor(turns);
    expect(history).toHaveLength(6);
    expect(history.map((m) => m.content).filter((c) => c.startsWith("q"))).toEqual([
      "q3",
      "q4",
      "q5",
    ]);
  });

  it("drops oldest pairs beyond the character budget", () => {
    const history = historyFor([
      turn(1, "done", 5000),
      turn(2, "done", 5000),
      turn(3, "done", 100),
    ]);
    const size = history.reduce((sum, m) => sum + Array.from(m.content).length, 0);
    expect(size).toBeLessThanOrEqual(8000);
    expect(history[0].content).toBe("q2");
  });

  it("counts characters, not UTF-16 units", () => {
    const history = historyFor([{ ...turn(1, "done"), answer: "😀".repeat(3900) }]);
    expect(history).toHaveLength(2);
  });
});

describe("answerAsNote", () => {
  let done: Turn;
  beforeEach(() => {
    done = { ...turn(1, "done"), answer: "the answer", question: "why?", context };
  });

  it("creates an unscheduled note with a stable source uid", () => {
    const note = answerAsNote(done, "My note");
    expect(note.in_review).toBe(false);
    expect(note.name).toBe("Discussion: My note");
    expect(note.content).toContain('source_note_uid: "uid-1"');
    expect(note.content).toContain("AI-generated answer");
    expect(note.content).not.toContain("incomplete");
    expect(note.content).not.toMatch(/api[_ ]?key/i);
  });

  it("marks incomplete answers and quotes hostile titles safely", () => {
    const note = answerAsNote({ ...done, status: "stopped", provider: 'x"\n---' }, "t".repeat(400));
    expect(note.content).toContain("incomplete");
    expect(note.content).toContain('ai_provider: "x\\"\\n---"');
    expect(note.name.length).toBeLessThanOrEqual(200);
  });
});

describe("answerHtml", () => {
  it("does not pass raw HTML through", () => {
    const html = answerHtml("<script>alert(1)</script><img src=x onerror=alert(1)> **ok**");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("<strong>ok</strong>");
  });

  it("replaces images with alt text so nothing is fetched", () => {
    const html = answerHtml("![tracker](https://evil.example/p.gif)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("tracker");
  });

  it("opens links safely and blocks script schemes", () => {
    const html = answerHtml("[a](https://example.com) [b](javascript:alert(1))");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener noreferrer");
    expect(html).not.toMatch(/href="javascript:/i);
  });
});
