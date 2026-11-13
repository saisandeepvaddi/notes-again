import { SettingsSkeleton } from "@/components/PageSkeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CloudCheckIcon,
  NotePencilIcon,
  DeviceMobileIcon,
  HardDrivesIcon,
  PaintBrushIcon,
  PlugsConnectedIcon,
  RepeatIcon,
  SignInIcon,
  ChatCircleTextIcon,
} from "@phosphor-icons/react";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";
import { ApiTokens } from "./api-tokens/ApiTokens";
import { AppearanceSettings } from "./appearance/AppearanceSettings";
import { NotesSettings } from "./notes/NotesSettings";
import { SettingsForm } from "./SettingsForm";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settingsSearch";
import { DevicesSettings } from "./devices/DevicesSettings";
import { SignInSettings } from "./sign-in/SignInSettings";
import { SyncSettings } from "./sync/SyncSettings";
import { SystemSettings } from "./system/SystemSettings";
import { useIsDesktop } from "@/sync/syncApi";
import { DiscussionSettings } from "@/discussion/DiscussionSettings";

const SECTIONS: Record<
  SettingsSection,
  { label: string; icon: typeof RepeatIcon; content: ReactNode }
> = {
  appearance: { label: "Appearance", icon: PaintBrushIcon, content: <AppearanceSettings /> },
  notes: { label: "Notes", icon: NotePencilIcon, content: <NotesSettings /> },
  review: { label: "Review", icon: RepeatIcon, content: <SettingsForm /> },
  discuss: { label: "Discuss", icon: ChatCircleTextIcon, content: <DiscussionSettings /> },
  "sign-in": { label: "Sign-in", icon: SignInIcon, content: <SignInSettings /> },
  sync: { label: "Sync", icon: CloudCheckIcon, content: <SyncSettings /> },
  devices: {
    label: "Phone & extension",
    icon: DeviceMobileIcon,
    content: <DevicesSettings />,
  },
  tokens: { label: "API tokens", icon: PlugsConnectedIcon, content: <ApiTokens /> },
  system: { label: "System", icon: HardDrivesIcon, content: <SystemSettings /> },
};

interface SettingsContainerProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export function SettingsContainer({ section, onSectionChange }: SettingsContainerProps) {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const sections = SETTINGS_SECTIONS.filter(
    (value) => (value !== "sync" && value !== "devices") || isDesktop,
  );
  return (
    <Tabs
      value={section}
      onValueChange={(value: SettingsSection) => onSectionChange(value)}
      orientation={isMobile ? "horizontal" : "vertical"}
      className="w-full gap-6 py-2"
    >
      <TabsList
        variant="line"
        aria-label="Settings sections"
        className="max-w-full shrink-0 justify-start overflow-x-auto md:w-44"
      >
        {sections.map((value) => {
          const { label, icon: Icon } = SECTIONS[value];
          return (
            <TabsTrigger key={value} value={value} className="flex-none md:px-2">
              <Icon />
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {sections.map((value) => (
        <TabsContent key={value} value={value} className="min-w-0">
          <Suspense fallback={<SettingsSkeleton />}>
            <ClientOnly>{SECTIONS[value].content}</ClientOnly>
          </Suspense>
        </TabsContent>
      ))}
    </Tabs>
  );
}
