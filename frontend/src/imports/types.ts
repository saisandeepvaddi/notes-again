import { z } from "zod";

export const ImportResultSchema = z.object({
  dry_run: z.boolean(),
  notes_created: z.number(),
  duplicates_skipped: z.number(),
  invalid_skipped: z.number(),
  new_decks: z.number(),
  new_tags: z.number(),
  decks: z.array(
    z.object({
      name: z.string().nullable(),
      is_new: z.boolean(),
      to_create: z.number(),
      skipped: z.number(),
    }),
  ),
  first_due: z.coerce.date().nullable(),
  last_due: z.coerce.date().nullable(),
  days_span: z.number(),
  issues: z.array(
    z.object({
      row: z.number(),
      name: z.string().nullable().optional(),
      deck: z.string().nullable().optional(),
      reason: z.string(),
    }),
  ),
  issues_truncated: z.boolean(),
  warnings: z.array(z.string()),
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

export const EXAMPLE_IMPORT = `{
  "decks": [
    {
      "name": "Leetcode",
      "notes": [
        {
          "name": "Segment tree",
          "content": "Range queries in O(log n).\\n\\n\`\`\`js\\nconst tree = [];\\n\`\`\`",
          "tags": ["dsa", "trees"],
          "difficulty": "hard"
        },
        { "name": "Two sum", "content": "Use a hash map.", "tags": ["dsa"] }
      ]
    }
  ],
  "notes": [
    { "name": "A loose note", "content": "No deck." },
    { "name": "Another one", "content": "Own deck.", "deck": "Random", "difficulty": "easy" }
  ]
}`;
