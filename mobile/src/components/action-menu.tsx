import MenuView from "@expo/ui/community/menu";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/use-theme";

export interface MenuItem {
  id: string;
  title: string;
  destructive?: boolean;
  checked?: boolean;
  children?: MenuItem[];
}

type NativeAction = {
  id: string;
  title: string;
  attributes?: { destructive: boolean };
  state?: "on" | "off";
  subactions?: NativeAction[];
};

function toNative(item: MenuItem): NativeAction {
  return {
    id: item.id,
    title: item.title,
    attributes: item.destructive ? { destructive: true } : undefined,
    state: item.checked ? "on" : undefined,
    subactions: item.children?.map(toNative),
  };
}

interface ActionMenuProps {
  title?: string;
  items: MenuItem[];
  onSelect: (id: string) => void;
  children: ReactNode;
}

export function ActionMenu({ title, items, onSelect, children }: ActionMenuProps) {
  const { scheme } = useTheme();
  return (
    <MenuView
      title={title}
      colorScheme={scheme}
      actions={items.map(toNative)}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
    >
      {children}
    </MenuView>
  );
}
