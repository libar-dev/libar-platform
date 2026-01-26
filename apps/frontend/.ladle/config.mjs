/** @type {import('@ladle/react').UserConfig} */
const config = {
  stories: "components/**/*.stories.tsx",
  port: 61000,
  viteConfig: ".ladle/vite.config.ts",
  addons: {
    theme: {
      enabled: true,
      defaultState: "light",
    },
  },
};

export default config;
