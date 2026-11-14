import type { Passage } from "./core";

const CITATION = /\[(\d{1,2})\](?!\()/g;

export interface CitationCheck {
  text: string;
  unverified: number[];
  cited: number[];
}

export function checkCitations(answer: string, passages: Passage[]): CitationCheck {
  const known = new Map(passages.map((passage) => [passage.n, passage]));
  const unverified = new Set<number>();
  const cited = new Set<number>();
  const text = answer.replace(CITATION, (_match, raw: string) => {
    const n = Number(raw);
    const passage = known.get(n);
    if (!passage) {
      unverified.add(n);
      return `[${n}?]`;
    }
    cited.add(n);
    return `[[${n}]](/notes/${passage.note_id})`;
  });
  return {
    text,
    unverified: [...unverified].sort((a, b) => a - b),
    cited: [...cited].sort((a, b) => a - b),
  };
}

export function chatAnswerAsNote(
  turn: { question: string; answer: string; provider: string; model: string; sources?: Passage[] },
  scopeLabel: string,
) {
  const sources = turn.sources ?? [];
  const uids = [...new Set(sources.map((source) => source.note_uid))];
  const list = sources.length
    ? `\n\n## Sources\n\n${sources
        .map((source) => `${source.n}. [${source.title || "Untitled"}](note:${source.note_uid})`)
        .join("\n")}`
    : "";
  return {
    name: `Chat: ${turn.question}`.replace(/\s+/g, " ").slice(0, 200),
    content: `---\nsource_note_uids: ${JSON.stringify(uids)}\nai_provider: ${JSON.stringify(turn.provider)}\nai_model: ${JSON.stringify(turn.model)}\nchat_scope: ${JSON.stringify(scopeLabel)}\n---\n\nAI-generated answer from retrieved passages; verify before relying on it.\n\n## Question\n\n${turn.question}\n\n## Answer\n\n${turn.answer}${list}`,
    first_reminder_at: new Date(),
    difficulty: "medium" as const,
    tag_ids: [],
    project_id: null,
    in_review: false,
  };
}
