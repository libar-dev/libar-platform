import type { Story, StoryDefault } from "@ladle/react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  InputGroupButton,
} from "./input-group";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon, Mail01Icon } from "@hugeicons/core-free-icons";

const meta: StoryDefault = {
  title: "Molecules/InputGroup",
};
export default meta;

export const WithPrefix: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput type="number" placeholder="0.00" />
    </InputGroup>
  </div>
);
WithPrefix.meta = {
  description: "Input with currency prefix",
};

export const WithSuffix: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupInput type="text" placeholder="username" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>@example.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
);
WithSuffix.meta = {
  description: "Input with domain suffix",
};

export const WithBoth: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput type="text" placeholder="example" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
);
WithBoth.meta = {
  description: "Input with prefix and suffix",
};

export const WithIcon: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <HugeiconsIcon icon={Search01Icon} className="text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput type="text" placeholder="Search..." />
    </InputGroup>
  </div>
);
WithIcon.meta = {
  description: "Input with search icon",
};

export const WithButton: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <HugeiconsIcon icon={Mail01Icon} className="text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput type="email" placeholder="Enter email" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" variant="ghost">
          <HugeiconsIcon icon={Cancel01Icon} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
);
WithButton.meta = {
  description: "Input with action button",
};

export const Disabled: Story = () => (
  <div className="max-w-sm p-4">
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput type="number" placeholder="0.00" disabled />
    </InputGroup>
  </div>
);
Disabled.meta = {
  description: "Disabled input group",
};
