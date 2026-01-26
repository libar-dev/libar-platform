import type { Story, StoryDefault } from "@ladle/react";
import { UserInfoForm } from "./user-info-form";

const meta: StoryDefault = {
  title: "Organisms/UserInfoForm",
};
export default meta;

export const Default: Story = () => (
  <UserInfoForm
    onSubmit={(data) => console.log("Form submitted:", data)}
    onCancel={() => console.log("Form cancelled")}
  />
);
Default.meta = {
  description: "Default user information form",
};

export const WithPrefilledData: Story = () => (
  <UserInfoForm
    defaultValues={{
      name: "John Doe",
      role: "developer",
      framework: "Next.js",
      comments: "I love building with React!",
    }}
    onSubmit={(data) => console.log("Form submitted:", data)}
    onCancel={() => console.log("Form cancelled")}
  />
);
WithPrefilledData.meta = {
  description: "Form with pre-filled default values",
};

export const CustomContent: Story = () => (
  <UserInfoForm
    title="Team Member Profile"
    description="Update your team profile information"
    frameworks={["React", "Vue", "Angular", "Svelte"]}
    roleItems={[
      { label: "Frontend", value: "frontend" },
      { label: "Backend", value: "backend" },
      { label: "Fullstack", value: "fullstack" },
      { label: "DevOps", value: "devops" },
    ]}
    onSubmit={(data) => console.log("Form submitted:", data)}
    onCancel={() => console.log("Form cancelled")}
  />
);
CustomContent.meta = {
  description: "Form with custom title, description, and options",
};
