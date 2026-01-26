import type { Story, StoryDefault } from "@ladle/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

const meta: StoryDefault = {
  title: "Atoms/Tabs",
};
export default meta;

/**
 * Default tabs with horizontal orientation
 */
export const Default: Story = () => (
  <Tabs defaultValue="account" className="w-[400px]">
    <TabsList>
      <TabsTrigger value="account">Account</TabsTrigger>
      <TabsTrigger value="password">Password</TabsTrigger>
      <TabsTrigger value="settings">Settings</TabsTrigger>
    </TabsList>
    <TabsContent value="account" className="p-4">
      <h3 className="text-lg font-medium">Account Settings</h3>
      <p className="text-muted-foreground">Manage your account settings and preferences.</p>
    </TabsContent>
    <TabsContent value="password" className="p-4">
      <h3 className="text-lg font-medium">Password</h3>
      <p className="text-muted-foreground">Change your password and security settings.</p>
    </TabsContent>
    <TabsContent value="settings" className="p-4">
      <h3 className="text-lg font-medium">General Settings</h3>
      <p className="text-muted-foreground">Configure your application preferences.</p>
    </TabsContent>
  </Tabs>
);
Default.meta = {
  description: "Default horizontal tabs with three options",
};

/**
 * Line variant - underline style tabs
 */
export const LineVariant: Story = () => (
  <Tabs defaultValue="overview" className="w-[400px]">
    <TabsList variant="line">
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="analytics">Analytics</TabsTrigger>
      <TabsTrigger value="reports">Reports</TabsTrigger>
    </TabsList>
    <TabsContent value="overview" className="p-4">
      <p className="text-muted-foreground">Overview content with line tabs.</p>
    </TabsContent>
    <TabsContent value="analytics" className="p-4">
      <p className="text-muted-foreground">Analytics dashboard content.</p>
    </TabsContent>
    <TabsContent value="reports" className="p-4">
      <p className="text-muted-foreground">Generated reports content.</p>
    </TabsContent>
  </Tabs>
);
LineVariant.meta = {
  description: "Tabs with underline indicator style",
};

/**
 * Vertical orientation
 */
export const Vertical: Story = () => (
  <Tabs defaultValue="general" orientation="vertical" className="w-[500px]">
    <TabsList>
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="appearance">Appearance</TabsTrigger>
      <TabsTrigger value="notifications">Notifications</TabsTrigger>
    </TabsList>
    <TabsContent value="general" className="p-4">
      <h3 className="text-lg font-medium">General Settings</h3>
      <p className="text-muted-foreground">Configure general application settings.</p>
    </TabsContent>
    <TabsContent value="appearance" className="p-4">
      <h3 className="text-lg font-medium">Appearance</h3>
      <p className="text-muted-foreground">Customize the look and feel of the application.</p>
    </TabsContent>
    <TabsContent value="notifications" className="p-4">
      <h3 className="text-lg font-medium">Notifications</h3>
      <p className="text-muted-foreground">Manage your notification preferences.</p>
    </TabsContent>
  </Tabs>
);
Vertical.meta = {
  description: "Tabs with vertical orientation",
};

/**
 * With card content - similar to admin page use case
 */
export const WithCards: Story = () => (
  <Tabs defaultValue="create" className="w-full max-w-2xl">
    <TabsList>
      <TabsTrigger value="create">Create Product</TabsTrigger>
      <TabsTrigger value="stock">Add Stock</TabsTrigger>
    </TabsList>
    <TabsContent value="create">
      <Card>
        <CardHeader>
          <CardTitle>Create New Product</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Product creation form would be displayed here.</p>
          <div className="mt-4 space-y-2">
            <div className="h-10 rounded bg-muted" />
            <div className="h-10 rounded bg-muted" />
            <div className="h-10 w-24 rounded bg-primary/20" />
          </div>
        </CardContent>
      </Card>
    </TabsContent>
    <TabsContent value="stock">
      <Card>
        <CardHeader>
          <CardTitle>Add Stock</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Stock management form would be displayed here.</p>
          <div className="mt-4 space-y-2">
            <div className="h-10 rounded bg-muted" />
            <div className="h-10 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-10 w-24 rounded bg-primary/20" />
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>
);
WithCards.meta = {
  description: "Tabs with card content - similar to Admin page use case",
};

/**
 * Disabled tab
 */
export const WithDisabled: Story = () => (
  <Tabs defaultValue="active" className="w-[400px]">
    <TabsList>
      <TabsTrigger value="active">Active</TabsTrigger>
      <TabsTrigger value="pending">Pending</TabsTrigger>
      <TabsTrigger value="archived" disabled>
        Archived
      </TabsTrigger>
    </TabsList>
    <TabsContent value="active" className="p-4">
      <p className="text-muted-foreground">Active items content.</p>
    </TabsContent>
    <TabsContent value="pending" className="p-4">
      <p className="text-muted-foreground">Pending items content.</p>
    </TabsContent>
    <TabsContent value="archived" className="p-4">
      <p className="text-muted-foreground">Archived items content.</p>
    </TabsContent>
  </Tabs>
);
WithDisabled.meta = {
  description: "Tabs with one disabled option",
};
