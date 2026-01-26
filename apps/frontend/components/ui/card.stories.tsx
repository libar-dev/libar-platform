import type { Story, StoryDefault } from "@ladle/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "./card";
import { Button } from "./button";

const meta: StoryDefault = {
  title: "Atoms/Card",
};
export default meta;

export const Default: Story = () => (
  <Card className="w-[350px]">
    <CardHeader>
      <CardTitle>Card Title</CardTitle>
      <CardDescription>Card description goes here.</CardDescription>
    </CardHeader>
    <CardContent>
      <p>This is the card content area. You can put any content here.</p>
    </CardContent>
    <CardFooter>
      <Button>Action</Button>
    </CardFooter>
  </Card>
);
Default.meta = {
  description: "Basic card with header, content, and footer",
};

export const WithAction: Story = () => (
  <Card className="w-[350px]">
    <CardHeader>
      <CardTitle>Card with Action</CardTitle>
      <CardDescription>This card has an action slot in the header.</CardDescription>
      <CardAction>
        <Button variant="ghost" size="icon-sm" aria-label="More options">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p>The action slot appears in the top-right corner of the header.</p>
    </CardContent>
  </Card>
);
WithAction.meta = {
  description: "Card with action button in header",
};

export const Sizes: Story = () => (
  <div className="flex flex-wrap gap-4">
    <Card className="w-[300px]">
      <CardHeader>
        <CardTitle>Default Size</CardTitle>
        <CardDescription>Standard card padding</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Default card content</p>
      </CardContent>
    </Card>
    <Card className="w-[300px]" size="sm">
      <CardHeader>
        <CardTitle>Small Size</CardTitle>
        <CardDescription>Compact card padding</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Small card content</p>
      </CardContent>
    </Card>
  </div>
);
Sizes.meta = {
  description: "Card size variants",
};

export const WithImage: Story = () => (
  <Card className="w-[350px]">
    <img
      src="https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400&h=200&fit=crop"
      alt="Gradient background"
      className="h-[150px] w-full object-cover"
    />
    <CardHeader>
      <CardTitle>Card with Image</CardTitle>
      <CardDescription>Images can be added at the top of cards.</CardDescription>
    </CardHeader>
    <CardContent>
      <p>The image automatically gets rounded corners when placed first.</p>
    </CardContent>
  </Card>
);
WithImage.meta = {
  description: "Card with image header",
};

export const HeaderOnly: Story = () => (
  <Card className="w-[350px]">
    <CardHeader>
      <CardTitle>Simple Card</CardTitle>
      <CardDescription>
        A minimal card with just a header. Good for notifications or simple status displays.
      </CardDescription>
    </CardHeader>
  </Card>
);
HeaderOnly.meta = {
  description: "Minimal card with header only",
};
