import { useAuth } from "@/auth/AuthProvider";
import { ProjectsSidebarSection } from "@/notes/projects/ProjectsSidebarSection";
import ThemeToggle from "@/theme/ThemeToggle";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ListTreeIcon,
  LogOutIcon,
  NotebookIcon,
  RepeatIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "./ui/sidebar";

const NAV_ITEMS = [
  { to: "/notes", label: "All Notes", icon: NotebookIcon },
  { to: "/review", label: "Review", icon: RepeatIcon },
  { to: "/import", label: "Import", icon: UploadIcon },
  { to: "/organize", label: "Organize", icon: ListTreeIcon },
  { to: "/trash", label: "Trash", icon: Trash2Icon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function SignOutButton() {
  const { status, firebaseUser, signOutUser } = useAuth();
  const label =
    status?.mode === "firebase"
      ? firebaseUser?.email
      : status?.mode === "local" && status.authenticated
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
          <LogOutIcon />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <Sidebar>
      <SidebarHeader className="font-semibold px-2">Notes Again</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton isActive={isActive} render={<Link to={item.to} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
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
