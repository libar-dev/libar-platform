import type { Story, StoryDefault } from "@ladle/react";
import { Field, FieldLabel, FieldDescription, FieldError } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

const meta: StoryDefault = {
  title: "Molecules/Field",
};
export default meta;

export const Default: Story = () => (
  <div className="max-w-sm p-4">
    <Field>
      <FieldLabel>Email</FieldLabel>
      <Input type="email" placeholder="you@example.com" />
    </Field>
  </div>
);
Default.meta = {
  description: "Basic field with label and input",
};

export const WithDescription: Story = () => (
  <div className="max-w-sm p-4">
    <Field>
      <FieldLabel>Username</FieldLabel>
      <Input type="text" placeholder="johndoe" />
      <FieldDescription>This will be your public display name.</FieldDescription>
    </Field>
  </div>
);
WithDescription.meta = {
  description: "Field with helper description",
};

export const WithError: Story = () => (
  <div className="max-w-sm p-4">
    <Field>
      <FieldLabel>Password</FieldLabel>
      <Input type="password" aria-invalid="true" />
      <FieldError>Password must be at least 8 characters.</FieldError>
    </Field>
  </div>
);
WithError.meta = {
  description: "Field displaying validation error",
};

export const WithTextarea: Story = () => (
  <div className="max-w-sm p-4">
    <Field>
      <FieldLabel>Bio</FieldLabel>
      <Textarea placeholder="Tell us about yourself..." />
      <FieldDescription>Maximum 500 characters.</FieldDescription>
    </Field>
  </div>
);
WithTextarea.meta = {
  description: "Field with textarea input",
};

export const CompleteExample: Story = () => (
  <div className="max-w-sm space-y-4 p-4">
    <Field>
      <FieldLabel>Full Name</FieldLabel>
      <Input type="text" placeholder="John Doe" />
    </Field>
    <Field>
      <FieldLabel>Email</FieldLabel>
      <Input type="email" placeholder="john@example.com" />
      <FieldDescription>We will never share your email.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel>Message</FieldLabel>
      <Textarea placeholder="Your message..." />
      <FieldError>Message is required.</FieldError>
    </Field>
  </div>
);
CompleteExample.meta = {
  description: "Multiple fields in a form layout",
};
