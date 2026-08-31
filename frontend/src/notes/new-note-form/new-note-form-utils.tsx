import { createFormHookContexts, formOptions } from "@tanstack/react-form";
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts();

import { Button } from "@/components/ui/button";
import { createFormHook } from "@tanstack/react-form";
import { type Note, NoteSchema } from "./types";

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => <Button disabled={isSubmitting}>{label}</Button>}
    </form.Subscribe>
  );
}

const defaultNote: Note = {
  name: "",
  content: "",
};

export const newNoteFormOptions = formOptions({
  defaultValues: defaultNote,
  validators: {
    onChange: NoteSchema,
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
