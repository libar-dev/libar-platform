import type { Story, StoryDefault } from "@ladle/react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
} from "./dropdown-menu";
import { Button } from "./button";
import { useState } from "react";

const meta: StoryDefault = {
  title: "Molecules/DropdownMenu",
};
export default meta;

export const Default: Story = () => (
  <div className="p-4">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Open Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuItem>Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
Default.meta = {
  description: "Basic dropdown menu",
};

export const WithShortcuts: Story = () => (
  <div className="p-4">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Edit</DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuItem>
          Undo <DropdownMenuShortcut>Cmd+Z</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Redo <DropdownMenuShortcut>Cmd+Y</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Cut <DropdownMenuShortcut>Cmd+X</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Copy <DropdownMenuShortcut>Cmd+C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Paste <DropdownMenuShortcut>Cmd+V</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
WithShortcuts.meta = {
  description: "Menu items with keyboard shortcuts",
};

export const WithCheckboxItems: Story = () => {
  const [showStatus, setShowStatus] = useState(true);
  const [showActivity, setShowActivity] = useState(false);

  return (
    <div className="p-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>View</DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={showStatus} onCheckedChange={setShowStatus}>
            Status
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={showActivity} onCheckedChange={setShowActivity}>
            Activity
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
WithCheckboxItems.meta = {
  description: "Menu with checkbox items for toggles",
};

export const WithRadioItems: Story = () => {
  const [position, setPosition] = useState("bottom");

  return (
    <div className="p-4">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>Position</DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuLabel>Panel Position</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
            <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
WithRadioItems.meta = {
  description: "Menu with radio items for single selection",
};

export const WithSubmenu: Story = () => (
  <div className="p-4">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Options</DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuItem>New File</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Share</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Email</DropdownMenuItem>
            <DropdownMenuItem>Message</DropdownMenuItem>
            <DropdownMenuItem>Link</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
WithSubmenu.meta = {
  description: "Menu with nested submenu",
};

export const DestructiveItem: Story = () => (
  <div className="p-4">
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Delete Account</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
DestructiveItem.meta = {
  description: "Menu with destructive action",
};
