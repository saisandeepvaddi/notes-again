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
              <AppSidebar />
              {/* min-w-0: without this a flex sibling of the sidebar won't
                  actually shrink below its content's width, so an overflowing
                  child (calendar, table) pushes the whole page wide instead of
                  scrolling on its own. */}
              <div className="flex min-w-0 w-full flex-1 flex-col">
                {/* Persistent, page-independent -- unlike putting the trigger
                    in each page's own header, this can't be forgotten on a
                    future page and silently lose mobile nav. */}
                <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2.5 md:hidden">
                  <SidebarTrigger />
                  <span className="text-sm font-semibold">Note and Learn</span>
                </header>
                <main className="w-full h-full p-4">
                  <Outlet />
                </main>
              </div>
            </SidebarProvider>
          </AuthGate>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default Layout;
