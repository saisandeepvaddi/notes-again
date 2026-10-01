import { useState } from "react";
import { View } from "react-native";
import { useCreateTag, useTags } from "@/api/notes";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { InlineError } from "@/components/screen-state";
import { TextField } from "@/components/text-field";

interface TagPickerProps {
  value: number[];
  onChange: (tagIds: number[]) => void;
}

export function TagPicker({ value, onChange }: TagPickerProps) {
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const choices = tags.filter((tag) => !tag.is_difficulty);

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((tagId) => tagId !== id) : [...value, id]);

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    const existing = choices.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id]);
      setDraft("");
      return;
    }
    setError(null);
    try {
      const tag = await createTag.mutateAsync(name);
      onChange([...value, tag.id]);
      setDraft("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't create that tag");
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {choices.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {choices.map((tag) => (
            <Chip
              key={tag.id}
              label={`#${tag.name}`}
              selected={value.includes(tag.id)}
              onPress={() => toggle(tag.id)}
            />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="New tag"
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={() => void add()}
          />
        </View>
        <Button
          variant="secondary"
          onPress={() => void add()}
          disabled={!draft.trim()}
          loading={createTag.isPending}
        >
          Add
        </Button>
      </View>
      {error ? <InlineError message={error} /> : null}
    </View>
  );
}
