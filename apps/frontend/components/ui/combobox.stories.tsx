import type { Story, StoryDefault } from "@ladle/react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxSeparator,
} from "./combobox";

const meta: StoryDefault = {
  title: "Molecules/Combobox",
};
export default meta;

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "svelte", label: "SvelteKit" },
];

export const Default: Story = () => (
  <div className="p-4">
    <Combobox>
      <ComboboxInput placeholder="Search frameworks..." className="w-[250px]" />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No framework found.</ComboboxEmpty>
          {frameworks.map((framework) => (
            <ComboboxItem key={framework.value} value={framework.value}>
              {framework.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
);
Default.meta = {
  description: "Searchable combobox with framework options",
};

export const WithGroups: Story = () => (
  <div className="p-4">
    <Combobox>
      <ComboboxInput placeholder="Select technology..." className="w-[250px]" />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No results found.</ComboboxEmpty>
          <ComboboxGroup>
            <ComboboxLabel>Frontend</ComboboxLabel>
            <ComboboxItem value="react">React</ComboboxItem>
            <ComboboxItem value="vue">Vue</ComboboxItem>
            <ComboboxItem value="angular">Angular</ComboboxItem>
          </ComboboxGroup>
          <ComboboxSeparator />
          <ComboboxGroup>
            <ComboboxLabel>Backend</ComboboxLabel>
            <ComboboxItem value="node">Node.js</ComboboxItem>
            <ComboboxItem value="python">Python</ComboboxItem>
            <ComboboxItem value="go">Go</ComboboxItem>
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
);
WithGroups.meta = {
  description: "Combobox with grouped options",
};

export const WithClearButton: Story = () => (
  <div className="p-4">
    <Combobox>
      <ComboboxInput placeholder="Search..." className="w-[250px]" showClear showTrigger={false} />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>No results.</ComboboxEmpty>
          {frameworks.map((framework) => (
            <ComboboxItem key={framework.value} value={framework.value}>
              {framework.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
);
WithClearButton.meta = {
  description: "Combobox with clear button instead of dropdown arrow",
};

export const Disabled: Story = () => (
  <div className="p-4">
    <Combobox disabled>
      <ComboboxInput placeholder="Disabled" className="w-[250px]" disabled />
      <ComboboxContent>
        <ComboboxList>
          {frameworks.map((framework) => (
            <ComboboxItem key={framework.value} value={framework.value}>
              {framework.label}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
);
Disabled.meta = {
  description: "Disabled combobox",
};
