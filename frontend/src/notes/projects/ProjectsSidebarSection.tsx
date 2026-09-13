import { Input } from "@/components/ui/input";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import { FolderIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { useCreateProject } from "../hooks/useCreateProject";
import { useProjects } from "../hooks/useProjects";

export function ProjectsSidebarSection() {
  const { data: projects = [] } = useProjects();
  const { mutateAsync: createProject, isPending } = useCreateProject();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeProjectId = useRouterState({
    select: (state) => (state.location.search as { projectId?: number }).projectId,
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (trimmed) {
      await createProject(trimmed);
    }
    setName("");
    setCreating(false);
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarGroupAction title="New project" onClick={() => setCreating(true)}>
        <PlusIcon />
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.map((project) => (
            <SidebarMenuItem key={project.id}>
              <SidebarMenuButton
                isActive={pathname === "/notes" && activeProjectId === project.id}
                render={<Link to="/notes" search={{ projectId: project.id }} />}
              >
                <FolderIcon />
                <span>{project.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {creating && (
            <SidebarMenuItem className="px-1">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <Input
                  autoFocus
                  placeholder="Project name"
                  value={name}
                  disabled={isPending}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => void submit()}
                />
              </form>
            </SidebarMenuItem>
          )}
          {projects.length === 0 && !creating && (
            <p className="px-2 text-xs text-muted-foreground">No projects yet</p>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
