import { useAuth } from "@/auth/AuthProvider";
import { SearchButton } from "@/command-palette/SearchButton";
import { useDueCount } from "@/notes/notes-list/useDueNotes";
import { ProjectsSidebarSection } from "@/notes/projects/ProjectsSidebarSection";
import ThemeToggle from "@/theme/ThemeToggle";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  GearIcon,
  NotebookIcon,
  RepeatIcon,
  SignOutIcon,
  TrashIcon,
  TreeStructureIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./ui/sidebar";
import { SyncIndicator } from "@/sync/SyncIndicator";

const NAV_ITEMS = [
  { to: "/notes", label: "All Notes", icon: NotebookIcon },
  { to: "/review", label: "Review", icon: RepeatIcon },
  { to: "/import", label: "Import", icon: UploadSimpleIcon },
  { to: "/organize", label: "Organize", icon: TreeStructureIcon },
  { to: "/trash", label: "Trash", icon: TrashIcon },
  { to: "/settings", label: "Settings", icon: GearIcon },
] as const;

function SignOutButton() {
  const { status, firebaseUser, signOutUser } = useAuth();
  const label =
    status?.mode === "firebase"
      ? firebaseUser?.email
      : status?.mode === "local" && status.authenticated
        ? status.username
        : (status?.mode === "proxy" || status?.mode === "cloudflare-access") && status.logout_url
          ? status.username
          : null;
  if (!label) {
    return null;
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={label}
          onClick={() => {
            void signOutUser();
          }}
        >
          <SignOutIcon />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: dueCount = 0 } = useDueCount();
  return (
    <Sidebar>
      <SidebarHeader className="flex-row items-center gap-2 px-2 font-semibold">
        <img src="/favicon.svg" alt="" className="size-5" />
        Notes Again
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SearchButton variant="sidebar" />
              </SidebarMenuItem>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton isActive={isActive} render={<Link to={item.to} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.to === "/review" && dueCount > 0 && (
                      <SidebarMenuBadge className="text-primary">
                        {dueCount.toLocaleString()}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <ProjectsSidebarSection />
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <SyncIndicator />
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
