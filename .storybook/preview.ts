import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0a0612" },
        { name: "light", value: "#ffffff" },
        { name: "gray", value: "#1a1a2e" },
      ],
    },
    layout: "centered",
  },
};

export default preview;
