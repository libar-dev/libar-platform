import type { Story, StoryDefault } from "@ladle/react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogMedia,
} from "./alert-dialog";
import { Button } from "./button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Delete02Icon } from "@hugeicons/core-free-icons";

const meta: StoryDefault = {
  title: "Molecules/AlertDialog",
};
export default meta;

export const Default: Story = () => (
  <div className="p-4">
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>Delete Item</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the item and remove the data
            from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
Default.meta = {
  description: "Confirmation dialog for destructive actions",
};

export const WithIcon: Story = () => (
  <div className="p-4">
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Show Warning</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <HugeiconsIcon icon={Alert02Icon} className="text-destructive size-6" />
          </AlertDialogMedia>
          <AlertDialogTitle>Warning</AlertDialogTitle>
          <AlertDialogDescription>
            This action may have unintended consequences. Please review before proceeding.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Go Back</AlertDialogCancel>
          <AlertDialogAction>I Understand</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
WithIcon.meta = {
  description: "Alert dialog with warning icon",
};

export const SaveChanges: Story = () => (
  <div className="p-4">
    <AlertDialog>
      <AlertDialogTrigger render={<Button />}>Save Changes</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Would you like to save them before leaving?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Discard</AlertDialogCancel>
          <AlertDialogAction>Save</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
SaveChanges.meta = {
  description: "Dialog for saving unsaved changes",
};

export const SmallSize: Story = () => (
  <div className="p-4">
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        Quick Delete
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <HugeiconsIcon icon={Delete02Icon} className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No</AlertDialogCancel>
          <AlertDialogAction>Yes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
SmallSize.meta = {
  description: "Compact alert dialog",
};

export const DestructiveAction: Story = () => (
  <div className="p-4">
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Delete Account</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10">
            <HugeiconsIcon icon={Delete02Icon} className="text-destructive" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete your account and all associated data. This action is
            irreversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Account</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive hover:bg-destructive/90">
            Delete Forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
DestructiveAction.meta = {
  description: "Alert dialog with destructive action button",
};
