import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Outlet } from "@tanstack/react-router";
import AppSidebar from "../AppSidebar";
function Layout() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <main className="w-full h-full p-4">
          <Outlet />
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export default Layout;
