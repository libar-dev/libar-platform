import type { Story, StoryDefault } from "@ladle/react";
import { Label } from "./label";
import { Input } from "./input";

const meta: StoryDefault = {
  title: "Atoms/Label",
};
export default meta;

export const Default: Story = () => (
  <div className="p-4">
    <Label>Username</Label>
  </div>
);
Default.meta = {
  description: "Standalone label",
};

export const WithInput: Story = () => (
  <div className="grid w-full max-w-sm gap-1.5 p-4">
    <Label htmlFor="email">Email</Label>
    <Input type="email" id="email" placeholder="Enter your email" />
  </div>
);
WithInput.meta = {
  description: "Label associated with an input field",
};

export const Required: Story = () => (
  <div className="grid w-full max-w-sm gap-1.5 p-4">
    <Label htmlFor="name">
      Full Name <span className="text-destructive">*</span>
    </Label>
    <Input type="text" id="name" placeholder="Enter your name" required />
  </div>
);
Required.meta = {
  description: "Label with required indicator",
};

export const Disabled: Story = () => (
  <div className="grid w-full max-w-sm gap-1.5 p-4">
    <Label htmlFor="disabled" className="opacity-50">
      Disabled Field
    </Label>
    <Input type="text" id="disabled" placeholder="Cannot edit" disabled />
  </div>
);
Disabled.meta = {
  description: "Label for a disabled input",
};
