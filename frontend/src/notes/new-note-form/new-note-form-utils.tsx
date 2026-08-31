import { createFormHookContexts, formOptions } from "@tanstack/react-form";
import { z } from "zod";
export const { fieldContext, useFieldContext, formContext, useFormContext } =
  createFormHookContexts();

import { createFormHook } from "@tanstack/react-form";

function SubmitButton({ label }: { label: string }) {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => <button disabled={isSubmitting}>{label}</button>}
    </form.Subscribe>
  );
}

const noteSchema = z.object({
  name: z.string(),
  content: z.string(),
});

type Note = z.infer<typeof noteSchema>;

const defaultNote: Note = {
  name: "",
  content: "",
};

export const newNoteFormOptions = formOptions({
  defaultValues: defaultNote,
  validators: {
    onChange: noteSchema,
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
