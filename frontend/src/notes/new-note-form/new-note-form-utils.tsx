import { createFormHookContexts, formOptions } from "@tanstack/react-form";
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts();

import { Button } from "@/components/ui/button";
import { createFormHook } from "@tanstack/react-form";
import type { ComponentProps } from "react";
import { NoteBaseSchema, type NoteBase } from "./types";

function SubmitButton({ label, ...props }: { label: string } & ComponentProps<typeof Button>) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting} {...props}>
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
    onChange: NoteBaseSchema,
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
