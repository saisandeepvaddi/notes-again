import { Host, Picker } from "@expo/ui";
import { useProjects } from "@/api/notes";
import { useTheme } from "@/hooks/use-theme";

const NO_PROJECT = -1;

interface ProjectPickerProps {
  value: number | null;
  onChange: (projectId: number | null) => void;
  disabled?: boolean;
}

export function ProjectPicker({ value, onChange, disabled }: ProjectPickerProps) {
  const { colors, scheme } = useTheme();
  const { data: projects = [] } = useProjects();
  return (
    <Host matchContents colorScheme={scheme} seedColor={colors.primary}>
      <Picker
        selectedValue={value ?? NO_PROJECT}
        onValueChange={(next) => onChange(next === NO_PROJECT ? null : Number(next))}
        enabled={!disabled}
      >
        <Picker.Item label="No project" value={NO_PROJECT} />
        {projects.map((project) => (
          <Picker.Item key={project.id} label={project.name} value={project.id} />
        ))}
      </Picker>
    </Host>
  );
}
