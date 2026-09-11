import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGate from "@/auth/AuthGate";
import { AuthProvider } from "@/auth/AuthProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { Outlet } from "@tanstack/react-router";
import AppSidebar from "../AppSidebar";
function Layout() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default Layout;
