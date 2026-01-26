import type { StoryDecorator } from "@ladle/react";

/**
 * Basic story container with padding
 */
export const StoryContainer: StoryDecorator = (Story) => (
  <div className="p-6">
    <Story />
  </div>
);

/**
 * Container for card-sized components with fixed width
 */
export const CardContainer: StoryDecorator = (Story) => (
  <div className="p-6">
    <div className="w-[400px]">
      <Story />
    </div>
  </div>
);

/**
 * Wide container for larger components
 */
export const WideContainer: StoryDecorator = (Story) => (
  <div className="mx-auto max-w-4xl p-6">
    <Story />
  </div>
);

/**
 * Full-width container for layout components
 */
export const FullWidthContainer: StoryDecorator = (Story) => (
  <div className="min-h-screen">
    <Story />
  </div>
);

/**
 * Grid container for displaying multiple items
 */
export const GridContainer: StoryDecorator = (Story) => (
  <div className="p-6">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Story />
    </div>
  </div>
);
