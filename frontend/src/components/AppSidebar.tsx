import { useAuth } from "@/auth/AuthProvider";
import { firebaseEnabled } from "@/lib/firebase";
import { Link, useRouterState } from "@tanstack/react-router";
import { HomeIcon, LogOutIcon, NotebookIcon, RepeatIcon, Trash2Icon } from "lucide-react";
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
} from "./ui/sidebar";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/notes", label: "All Notes", icon: NotebookIcon },
  { to: "/review", label: "Review", icon: RepeatIcon },
  { to: "/trash", label: "Trash", icon: Trash2Icon },
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
      </SidebarContent>
      {firebaseEnabled ? (
        <SidebarFooter>
          <SignOutButton />
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}

export default AppSidebar;
