import type { Story, StoryDefault } from "@ladle/react";
import { Textarea } from "./textarea";
import { Field, FieldLabel } from "./field";

const meta: StoryDefault = {
  title: "Atoms/Textarea",
};
export default meta;

export const Default: Story = () => (
  <div className="w-[350px] p-4">
    <Textarea placeholder="Enter your message..." />
  </div>
);
Default.meta = {
  description: "Basic textarea",
};

export const WithLabel: Story = () => (
  <div className="w-[350px] p-4">
    <Field>
      <FieldLabel htmlFor="labeled-textarea">Comments</FieldLabel>
      <Textarea id="labeled-textarea" placeholder="Add any additional comments..." />
    </Field>
  </div>
);
WithLabel.meta = {
  description: "Textarea with field label",
};

export const States: Story = () => (
  <div className="flex w-[350px] flex-col gap-4 p-4">
    <Field>
      <FieldLabel htmlFor="normal-textarea">Normal</FieldLabel>
      <Textarea id="normal-textarea" placeholder="Normal textarea" />
    </Field>
    <Field>
      <FieldLabel htmlFor="disabled-textarea">Disabled</FieldLabel>
      <Textarea id="disabled-textarea" placeholder="Disabled textarea" disabled />
    </Field>
    <Field>
      <FieldLabel htmlFor="invalid-textarea">Invalid</FieldLabel>
      <Textarea id="invalid-textarea" placeholder="Invalid textarea" aria-invalid />
    </Field>
  </div>
);
States.meta = {
  description: "Textarea states",
};

export const WithContent: Story = () => (
  <div className="w-[350px] p-4">
    <Field>
      <FieldLabel htmlFor="content-textarea">Description</FieldLabel>
      <Textarea
        id="content-textarea"
        defaultValue="This is a textarea with pre-filled content. The textarea automatically adjusts its height based on the content using field-sizing-content."
      />
    </Field>
  </div>
);
WithContent.meta = {
  description: "Textarea with pre-filled content",
};
