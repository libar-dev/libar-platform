import type { Story, StoryDefault } from "@ladle/react";
import { Input } from "./input";
import { Field, FieldLabel } from "./field";

const meta: StoryDefault = {
  title: "Atoms/Input",
};
export default meta;

export const Default: Story = () => (
  <div className="w-[300px] p-4">
    <Input placeholder="Enter text..." />
  </div>
);
Default.meta = {
  description: "Basic text input",
};

export const WithLabel: Story = () => (
  <div className="w-[300px] p-4">
    <Field>
      <FieldLabel htmlFor="labeled-input">Email Address</FieldLabel>
      <Input id="labeled-input" type="email" placeholder="you@example.com" />
    </Field>
  </div>
);
WithLabel.meta = {
  description: "Input with field label",
};

export const Types: Story = () => (
  <div className="flex w-[300px] flex-col gap-4 p-4">
    <Field>
      <FieldLabel htmlFor="text-input">Text</FieldLabel>
      <Input id="text-input" type="text" placeholder="Enter text" />
    </Field>
    <Field>
      <FieldLabel htmlFor="email-input">Email</FieldLabel>
      <Input id="email-input" type="email" placeholder="you@example.com" />
    </Field>
    <Field>
      <FieldLabel htmlFor="password-input">Password</FieldLabel>
      <Input id="password-input" type="password" placeholder="••••••••" />
    </Field>
    <Field>
      <FieldLabel htmlFor="number-input">Number</FieldLabel>
      <Input id="number-input" type="number" placeholder="0" />
    </Field>
    <Field>
      <FieldLabel htmlFor="date-input">Date</FieldLabel>
      <Input id="date-input" type="date" />
    </Field>
  </div>
);
Types.meta = {
  description: "Different input types",
};

export const States: Story = () => (
  <div className="flex w-[300px] flex-col gap-4 p-4">
    <Field>
      <FieldLabel htmlFor="normal-input">Normal</FieldLabel>
      <Input id="normal-input" placeholder="Normal input" />
    </Field>
    <Field>
      <FieldLabel htmlFor="disabled-input">Disabled</FieldLabel>
      <Input id="disabled-input" placeholder="Disabled input" disabled />
    </Field>
    <Field>
      <FieldLabel htmlFor="invalid-input">Invalid</FieldLabel>
      <Input id="invalid-input" placeholder="Invalid input" aria-invalid />
    </Field>
  </div>
);
States.meta = {
  description: "Input states",
};
