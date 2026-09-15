import { useAuth } from "@/auth/AuthProvider";
import { firebaseEnabled } from "@/lib/firebase";
import { ProjectsSidebarSection } from "@/notes/projects/ProjectsSidebarSection";
import ThemeToggle from "@/theme/ThemeToggle";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  HomeIcon,
  LogOutIcon,
  NotebookIcon,
  RepeatIcon,
  SettingsIcon,
  Trash2Icon,
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
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/notes", label: "All Notes", icon: NotebookIcon },
  { to: "/review", label: "Review", icon: RepeatIcon },
  { to: "/trash", label: "Trash", icon: Trash2Icon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function SignOutButton() {
  const { user, signOutUser } = useAuth();
  if (!user) {
    return null;
  }
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={user.email ?? "Sign out"}
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
      <SidebarHeader className="font-semibold px-2">Note and Learn</SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
        {firebaseEnabled ? <SignOutButton /> : null}
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
