import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MIN_PASSWORD_LENGTH = 8;

export interface CredentialsValues {
  username: string;
  password: string;
  currentPassword?: string;
}

interface CredentialsFormProps {
  initialUsername: string;
  askCurrentPassword?: boolean;
  submitLabel: string;
  onSubmit: (values: CredentialsValues) => Promise<void>;
}

function Field({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function CredentialsForm({
  initialUsername,
  askCurrentPassword = false,
  submitLabel,
  onSubmit,
}: CredentialsFormProps) {
  const id = useId();
  const [username, setUsername] = useState(initialUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        username: username.trim(),
        password,
        currentPassword: askCurrentPassword ? currentPassword : undefined,
      });
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <Field label="Username" id={`${id}-username`}>
        <Input
          id={`${id}-username`}
          autoComplete="username"
          autoCapitalize="none"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </Field>
      {askCurrentPassword ? (
        <Field label="Current password" id={`${id}-current`}>
          <Input
            id={`${id}-current`}
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
      ) : null}
      <Field label="New password" id={`${id}-password`}>
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password" id={`${id}-confirm`}>
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
