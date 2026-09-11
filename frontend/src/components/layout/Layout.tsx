import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGate from "@/auth/AuthGate";
import { AuthProvider } from "@/auth/AuthProvider";
import { Outlet } from "@tanstack/react-router";
import AppSidebar from "../AppSidebar";
function Layout() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <AuthGate>
          <SidebarProvider>
            <AppSidebar />
            <main className="w-full h-full p-4">
              <Outlet />
            </main>
          </SidebarProvider>
        </AuthGate>
      </AuthProvider>
    </TooltipProvider>
  );
}

export default Layout;
