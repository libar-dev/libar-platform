import type { Story, StoryDefault } from "@ladle/react";
import { Separator } from "./separator";

const meta: StoryDefault = {
  title: "Atoms/Separator",
};
export default meta;

export const Horizontal: Story = () => (
  <div className="p-4">
    <p className="text-sm text-muted-foreground">Content above</p>
    <Separator className="my-4" />
    <p className="text-sm text-muted-foreground">Content below</p>
  </div>
);
Horizontal.meta = {
  description: "Default horizontal separator",
};

export const Vertical: Story = () => (
  <div className="flex h-20 items-center gap-4 p-4">
    <span className="text-sm">Left</span>
    <Separator orientation="vertical" />
    <span className="text-sm">Right</span>
  </div>
);
Vertical.meta = {
  description: "Vertical separator between inline elements",
};

export const WithText: Story = () => (
  <div className="p-4">
    <div className="flex items-center gap-4">
      <Separator className="flex-1" />
      <span className="text-sm text-muted-foreground">OR</span>
      <Separator className="flex-1" />
    </div>
  </div>
);
WithText.meta = {
  description: "Separator with text in the middle",
};
