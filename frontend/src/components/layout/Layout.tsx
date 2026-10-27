import { CommandPalette } from "@/command-palette/CommandPalette";
import { CommandPaletteProvider } from "@/command-palette/PaletteContext";
import { SearchButton } from "@/command-palette/SearchButton";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
              <CommandPaletteProvider>
                <AppSidebar />
                <div className="flex min-w-0 w-full flex-1 flex-col">
                  <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3 md:hidden">
                    <SidebarTrigger />
                    <span className="text-sm font-semibold">Notes Again</span>
                    <SearchButton variant="icon" className="ml-auto" />
                  </header>
                  <main className="w-full h-full p-4">
                    <Outlet />
                  </main>
                </div>
                <CommandPalette />
              </CommandPaletteProvider>
            </SidebarProvider>
          </AuthGate>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default Layout;
