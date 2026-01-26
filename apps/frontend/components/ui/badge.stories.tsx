import type { Story, StoryDefault } from "@ladle/react";
import { Badge } from "./badge";

const meta: StoryDefault = {
  title: "Atoms/Badge",
};
export default meta;

export const Variants: Story = () => (
  <div className="flex flex-wrap gap-4 p-4">
    <Badge variant="default">Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="outline">Outline</Badge>
    <Badge variant="ghost">Ghost</Badge>
    <Badge variant="destructive">Destructive</Badge>
    <Badge variant="link">Link</Badge>
  </div>
);
Variants.meta = {
  description: "All available badge variants",
};

export const WithIcons: Story = () => (
  <div className="flex flex-wrap gap-4 p-4">
    <Badge variant="default">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-icon="inline-start"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      Completed
    </Badge>
    <Badge variant="secondary">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-icon="inline-start"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      Pending
    </Badge>
    <Badge variant="destructive">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        data-icon="inline-start"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      Error
    </Badge>
  </div>
);
WithIcons.meta = {
  description: "Badges with leading icons",
};

export const AsLink: Story = () => (
  <div className="flex flex-wrap gap-4 p-4">
    <Badge render={<a href="#" />} variant="default">
      Clickable Default
    </Badge>
    <Badge render={<a href="#" />} variant="secondary">
      Clickable Secondary
    </Badge>
    <Badge render={<a href="#" />} variant="outline">
      Clickable Outline
    </Badge>
  </div>
);
AsLink.meta = {
  description: "Badges rendered as links (using render prop)",
};

export const StatusExamples: Story = () => (
  <div className="flex flex-col gap-4 p-4">
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Order Status:</span>
      <Badge variant="default">Confirmed</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Order Status:</span>
      <Badge variant="secondary">Processing</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Order Status:</span>
      <Badge variant="outline">Shipped</Badge>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Order Status:</span>
      <Badge variant="destructive">Cancelled</Badge>
    </div>
  </div>
);
StatusExamples.meta = {
  description: "Real-world status badge examples",
};
