import * as Haptics from "expo-haptics";
import { Fragment, type ReactNode } from "react";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import type { RichEditorController } from "./index";
import { TOOLBAR_HEIGHT } from "./shared";
import type { BlockKind, ListKind } from "./types";
import { useTheme } from "@/hooks/use-theme";
import { fonts, radius } from "@/theme";

type IconProps = Parameters<typeof Icon>[0];

interface Tool {
  key: string;
  label: string;
  icon?: Pick<IconProps, "ios" | "android">;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const HEADING_CYCLE: Record<string, BlockKind> = {
  h1: "h2",
  h2: "h3",
  h3: "paragraph",
};

function ToolButton({ tool }: { tool: Tool }) {
  const { colors } = useTheme();
  const tint = tool.active ? colors.primary : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tool.label}
      accessibilityState={{ selected: tool.active, disabled: tool.disabled }}
      disabled={tool.disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        tool.onPress();
      }}
      style={{ width: 42, height: TOOLBAR_HEIGHT, alignItems: "center", justifyContent: "center" }}
    >
      {({ pressed }) => (
        <View
          style={{
            minWidth: 36,
            height: 36,
            paddingHorizontal: 4,
            borderRadius: radius.md,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tool.active
              ? colors.primaryTint
              : pressed
                ? colors.pressed
                : "transparent",
            opacity: tool.disabled ? 0.3 : 1,
          }}
        >
          {tool.icon ? (
            <Icon ios={tool.icon.ios} android={tool.icon.android} size={19} color={tint} />
          ) : (
            <Text style={{ fontFamily: fonts.sansSemibold, fontSize: 15, color: tint }}>
              {tool.text}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

function Separator() {
  const { colors } = useTheme();
  return (
    <View style={{ width: 1, height: 20, marginHorizontal: 4, backgroundColor: colors.border }} />
  );
}

function ToolbarEdge({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: "100%",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 2,
        borderLeftWidth: 1,
        borderLeftColor: colors.border,
      }}
    >
      {children}
    </View>
  );
}

function Bar({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel="Formatting"
      style={{
        height: TOOLBAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.shelf,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {children}
    </View>
  );
}

const displayUrl = (url: string) => url.replace(/^[a-z][a-z\d+.-]*:\/\//i, "").replace(/\/$/, "");

function LinkChip({ url, onPress }: { url: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit link ${url}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        maxWidth: "45%",
        height: 34,
        marginLeft: 6,
        marginRight: 2,
        paddingHorizontal: 10,
        borderRadius: radius.md,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors.pressed : colors.primaryTint,
      })}
    >
      <Icon ios="link" android="link" size={15} color={colors.primary} />
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primary }}
      >
        {displayUrl(url)}
      </Text>
      <Icon ios="pencil" android="edit" size={13} color={colors.primary} />
    </Pressable>
  );
}

export function MarkdownToolbar({ controller }: { controller: RichEditorController }) {
  const { format, bridge } = controller;
  const editor = () => bridge.handle;
  const heading = /^h([1-6])$/.exec(format.block)?.[1];
  const toggleList = (kind: ListKind) => editor()?.list(format.list === kind ? "" : kind);

  const groups: Tool[][] = [
    [
      {
        key: "undo",
        label: "Undo",
        icon: { ios: "arrow.uturn.backward", android: "undo" },
        disabled: !format.canUndo,
        onPress: () => editor()?.undo(),
      },
      {
        key: "redo",
        label: "Redo",
        icon: { ios: "arrow.uturn.forward", android: "redo" },
        disabled: !format.canRedo,
        onPress: () => editor()?.redo(),
      },
    ],
    [
      {
        key: "heading",
        label: heading ? `Heading ${heading}, change level` : "Make heading",
        text: heading ? `H${heading}` : "H",
        active: !!heading,
        onPress: () => editor()?.block(HEADING_CYCLE[format.block] ?? "h1"),
      },
      {
        key: "bold",
        label: "Bold",
        icon: { ios: "bold", android: "format_bold" },
        active: format.bold,
        onPress: () => editor()?.format("bold"),
      },
      {
        key: "italic",
        label: "Italic",
        icon: { ios: "italic", android: "format_italic" },
        active: format.italic,
        onPress: () => editor()?.format("italic"),
      },
      {
        key: "code",
        label: "Inline code",
        icon: { ios: "chevron.left.forwardslash.chevron.right", android: "code" },
        active: format.code,
        onPress: () => editor()?.format("code"),
      },
      {
        key: "link",
        label: format.link ? "Edit link" : "Link",
        icon: { ios: "link", android: "link" },
        active: !!format.link,
        onPress: controller.openLinkEditor,
      },
    ],
    [
      {
        key: "bullet",
        label: "Bulleted list",
        icon: { ios: "list.bullet", android: "format_list_bulleted" },
        active: format.list === "bullet",
        onPress: () => toggleList("bullet"),
      },
      {
        key: "number",
        label: "Numbered list",
        icon: { ios: "list.number", android: "format_list_numbered" },
        active: format.list === "number",
        onPress: () => toggleList("number"),
      },
      {
        key: "check",
        label: "Checklist",
        icon: { ios: "checklist", android: "checklist" },
        active: format.list === "check",
        onPress: () => toggleList("check"),
      },
      {
        key: "quote",
        label: "Quote",
        icon: { ios: "text.quote", android: "format_quote" },
        active: format.block === "quote",
        onPress: () => editor()?.block(format.block === "quote" ? "paragraph" : "quote"),
      },
    ],
    [
      {
        key: "codeblock",
        label: "Code block",
        icon: { ios: "curlybraces", android: "data_object" },
        onPress: () => editor()?.codeBlock(),
      },
    ],
    [
      {
        key: "outdent",
        label: "Outdent",
        icon: { ios: "decrease.indent", android: "format_indent_decrease" },
        onPress: () => editor()?.indent(-1),
      },
      {
        key: "indent",
        label: "Indent",
        icon: { ios: "increase.indent", android: "format_indent_increase" },
        onPress: () => editor()?.indent(1),
      },
    ],
  ];

  return (
    <Bar>
      {format.link ? <LinkChip url={format.link.url} onPress={controller.openLinkEditor} /> : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ alignItems: "center", paddingHorizontal: 4 }}
        style={{ flex: 1 }}
      >
        {groups.map((group, index) => (
          <Fragment key={group[0].key}>
            {index > 0 ? <Separator /> : null}
            {group.map((tool) => (
              <ToolButton key={tool.key} tool={tool} />
            ))}
          </Fragment>
        ))}
      </ScrollView>
      <ToolbarEdge>
        <ToolButton
          tool={{
            key: "dismiss",
            label: "Hide keyboard",
            icon: { ios: "keyboard.chevron.compact.down", android: "keyboard_hide" },
            onPress: () => {
              editor()?.blur();
              Keyboard.dismiss();
            },
          }}
        />
      </ToolbarEdge>
    </Bar>
  );
}
