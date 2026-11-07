import { format } from "date-fns";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { exportLibrary, type ImportResult, useImportLibrary } from "@/api/library";
import { AppText } from "@/components/app-text";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { InlineError } from "@/components/screen-state";
import { useTheme } from "@/hooks/use-theme";
import { space } from "@/theme";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

function summary(result: ImportResult) {
  const lines = [
    `${result.notes_created.toLocaleString()} ${result.notes_created === 1 ? "note" : "notes"} ${result.dry_run ? "to add" : "added"}`,
  ];
  if (result.new_decks > 0)
    lines.push(`${result.new_decks} new ${result.new_decks === 1 ? "project" : "projects"}`);
  if (result.new_tags > 0)
    lines.push(`${result.new_tags} new ${result.new_tags === 1 ? "tag" : "tags"}`);
  if (result.restored_reviews > 0) lines.push(`${result.restored_reviews} with review history`);
  if (result.duplicates_skipped > 0)
    lines.push(`${result.duplicates_skipped} already here, skipped`);
  if (result.invalid_skipped > 0) lines.push(`${result.invalid_skipped} couldn’t be read, skipped`);
  return lines;
}

function ExportCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await exportLibrary();
      const file = new File(Paths.cache, `notes-again-${format(new Date(), "yyyy-MM-dd")}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Export notes",
        UTI: "public.json",
      });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <AppText variant="heading">Export</AppText>
      <AppText tone="muted">
        Every note, project and tag with its review history, as one JSON file you can import
        anywhere Notes Again runs.
      </AppText>
      {error ? <InlineError message={error} /> : null}
      <Button variant="outline" onPress={() => void share()} loading={busy}>
        Export and share
      </Button>
    </Card>
  );
}

function ImportCard() {
  const { colors } = useTheme();
  const importLibrary = useImportLibrary();
  const [picked, setPicked] = useState<{ name: string; payload: unknown } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    setResult(null);
    try {
      const choice = await File.pickFileAsync({ mimeTypes: ["application/json", "text/plain"] });
      if (choice.canceled) return;
      const payload: unknown = JSON.parse(await choice.result.text());
      setPicked({ name: choice.result.name, payload });
      setResult(await importLibrary.mutateAsync({ payload, dryRun: true }));
    } catch (failure) {
      setPicked(null);
      setError(
        failure instanceof SyntaxError
          ? "That file isn’t JSON. Export from Notes Again, or use the JSON import format."
          : errorText(failure),
      );
    }
  };

  const commit = async () => {
    if (!picked) return;
    setError(null);
    try {
      setResult(await importLibrary.mutateAsync({ payload: picked.payload, dryRun: false }));
      setPicked(null);
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <Card>
      <AppText variant="heading">Import</AppText>
      <AppText tone="muted">
        Bring in a Notes Again export or a JSON deck. You see what will change before anything is
        added, and notes that are already here are skipped.
      </AppText>
      {result ? (
        <View
          style={{
            gap: 4,
            padding: 12,
            borderRadius: 10,
            backgroundColor: colors.secondary,
          }}
        >
          <AppText variant="label">
            {result.dry_run ? `Preview of ${picked?.name ?? "the file"}` : "Imported"}
          </AppText>
          {summary(result).map((line) => (
            <AppText key={line} variant="caption" tone="muted">
              {line}
            </AppText>
          ))}
          {result.warnings.map((warning) => (
            <AppText key={warning} variant="caption" tone="muted">
              {warning}
            </AppText>
          ))}
        </View>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      {picked && result?.dry_run ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              onPress={() => void commit()}
              loading={importLibrary.isPending}
              disabled={result.notes_created === 0}
            >
              {result.notes_created === 0 ? "Nothing to add" : "Import"}
            </Button>
          </View>
          <Button
            variant="ghost"
            onPress={() => {
              setPicked(null);
              setResult(null);
            }}
          >
            Cancel
          </Button>
        </View>
      ) : (
        <Button variant="outline" onPress={() => void pick()} loading={importLibrary.isPending}>
          Choose a file
        </Button>
      )}
    </Card>
  );
}

export function TransferScreen() {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.gutter, gap: 16, paddingBottom: 40 }}
    >
      <ExportCard />
      <ImportCard />
    </ScrollView>
  );
}
