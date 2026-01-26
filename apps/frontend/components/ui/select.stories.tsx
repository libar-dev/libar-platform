import type { Story, StoryDefault } from "@ladle/react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "./select";

const meta: StoryDefault = {
  title: "Atoms/Select",
};
export default meta;

export const Default: Story = () => (
  <div className="p-4">
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue>Select a fruit</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
        <SelectItem value="grape">Grape</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
Default.meta = {
  description: "Basic select dropdown",
};

export const WithGroups: Story = () => (
  <div className="p-4">
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue>Select a food</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Fruits</SelectLabel>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Vegetables</SelectLabel>
          <SelectItem value="carrot">Carrot</SelectItem>
          <SelectItem value="broccoli">Broccoli</SelectItem>
          <SelectItem value="spinach">Spinach</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);
WithGroups.meta = {
  description: "Select with grouped options",
};

export const Disabled: Story = () => (
  <div className="p-4">
    <Select disabled>
      <SelectTrigger className="w-[180px]">
        <SelectValue>Disabled</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option">Option</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
Disabled.meta = {
  description: "Disabled select",
};

export const SmallSize: Story = () => (
  <div className="p-4">
    <Select>
      <SelectTrigger className="w-[140px]" size="sm">
        <SelectValue>Small</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
        <SelectItem value="option3">Option 3</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
SmallSize.meta = {
  description: "Small size select",
};

export const WithDisabledOption: Story = () => (
  <div className="p-4">
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue>Select status</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="archived" disabled>
          Archived
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
);
WithDisabledOption.meta = {
  description: "Select with a disabled option",
};

export const WithDefaultValue: Story = () => (
  <div className="p-4">
    <Select defaultValue="banana">
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
WithDefaultValue.meta = {
  description: "Select with a pre-selected value",
};
