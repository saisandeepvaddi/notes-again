import { createFormHookContexts, formOptions } from "@tanstack/react-form";
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts();

import { Button } from "@/components/ui/button";
import { createFormHook } from "@tanstack/react-form";
import type { ComponentProps } from "react";
import { NewNoteFormSchema, type NoteBase } from "./types";

function SubmitButton({ label, ...props }: { label: string } & ComponentProps<typeof Button>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.isSubmitting, state.canSubmit] as const}>
      {([isSubmitting, canSubmit]) => (
        <Button type="submit" disabled={isSubmitting || !canSubmit} {...props}>
          {label}
        </Button>
      )}
    </form.Subscribe>
  );
}

const defaultNote: NoteBase = {
  name: "",
  content: "",
};

export const newNoteFormOptions = formOptions({
  defaultValues: defaultNote,
  validators: {
    onChange: NewNoteFormSchema,
  },
});

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldComponents: {},
  formComponents: {
    SubmitButton,
  },
  fieldContext,
  formContext,
});
