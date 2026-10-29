import { SettingsSkeleton } from "@/components/PageSkeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CloudCheckIcon,
  HardDrivesIcon,
  PaintBrushIcon,
  PlugsConnectedIcon,
  RepeatIcon,
  SignInIcon,
} from "@phosphor-icons/react";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";
import { ApiTokens } from "./api-tokens/ApiTokens";
import { AppearanceSettings } from "./appearance/AppearanceSettings";
import { SettingsForm } from "./SettingsForm";
import { SETTINGS_SECTIONS, type SettingsSection } from "./settingsSearch";
import { SignInSettings } from "./sign-in/SignInSettings";
import { SyncSettings } from "./sync/SyncSettings";
import { SystemSettings } from "./system/SystemSettings";
import { useIsDesktop } from "@/sync/syncApi";

const SECTIONS: Record<
  SettingsSection,
  { label: string; icon: typeof RepeatIcon; content: ReactNode }
> = {
  appearance: { label: "Appearance", icon: PaintBrushIcon, content: <AppearanceSettings /> },
  review: { label: "Review", icon: RepeatIcon, content: <SettingsForm /> },
  "sign-in": { label: "Sign-in", icon: SignInIcon, content: <SignInSettings /> },
  sync: { label: "Sync", icon: CloudCheckIcon, content: <SyncSettings /> },
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
  const sections = SETTINGS_SECTIONS.filter((value) => value !== "sync" || isDesktop);
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
      {SETTINGS_SECTIONS.map((value) => (
        <TabsContent key={value} value={value} className="min-w-0">
          <Suspense fallback={<SettingsSkeleton />}>
            <ClientOnly>{SECTIONS[value].content}</ClientOnly>
          </Suspense>
        </TabsContent>
      ))}
    </Tabs>
  );
}
