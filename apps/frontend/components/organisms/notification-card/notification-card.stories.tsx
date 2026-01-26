import type { Story, StoryDefault } from "@ladle/react";
import { NotificationCard } from "./notification-card";

const meta: StoryDefault = {
  title: "Organisms/NotificationCard",
};
export default meta;

export const Default: Story = () => (
  <NotificationCard
    title="New Feature Available"
    description="Check out the latest updates to improve your workflow."
    variant="info"
    onAction={() => console.log("Action clicked")}
  />
);
Default.meta = {
  description: "Basic notification card without image",
};

export const WithImage: Story = () => (
  <NotificationCard
    title="Observability Plus is replacing Monitoring"
    description="Switch to the improved way to explore your data, with natural language. Monitoring will no longer be available on the Pro plan in November, 2025."
    imageUrl="https://images.unsplash.com/photo-1604076850742-4c7221f3101b?q=80&w=400&auto=format&fit=crop"
    imageAlt="Abstract gradient"
    variant="warning"
    onAction={() => console.log("Learn more clicked")}
  />
);
WithImage.meta = {
  description: "Notification card with hero image",
};

export const WithDialog: Story = () => (
  <NotificationCard
    title="Permission Required"
    description="This action requires additional permissions to proceed."
    variant="warning"
    actionLabel="Request Access"
    dialog={{
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-6"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: "Request Access",
      description:
        "Do you want to request access to this resource? An admin will review your request.",
      confirmLabel: "Request",
      cancelLabel: "Cancel",
      onConfirm: () => console.log("Access requested"),
      onCancel: () => console.log("Cancelled"),
    }}
  />
);
WithDialog.meta = {
  description: "Notification card that opens a confirmation dialog",
};

export const Variants: Story = () => (
  <div className="flex flex-col gap-4">
    <NotificationCard
      title="Information"
      description="This is an informational notification."
      variant="info"
    />
    <NotificationCard
      title="Warning"
      description="This is a warning notification."
      variant="warning"
    />
    <NotificationCard
      title="Success"
      description="This is a success notification."
      variant="success"
    />
    <NotificationCard title="Error" description="This is an error notification." variant="error" />
  </div>
);
Variants.meta = {
  description: "All notification card variants",
};
