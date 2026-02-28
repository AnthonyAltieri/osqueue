import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "osqueue",
  tagline: "A distributed job queue built on object storage",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://osqueue.com",
  baseUrl: "/",

  onBrokenLinks: "throw",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "osqueue",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          href: "https://demo.osqueue.com",
          label: "Live Demo",
          position: "left",
        },
        {
          href: "https://github.com/AnthonyAltieri/osqueue",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Getting Started", to: "/getting-started/installation" },
            { label: "Concepts", to: "/concepts/architecture" },
            { label: "API Reference", to: "/api/client" },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/AnthonyAltieri/osqueue",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} osqueue contributors.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json", "typescript", "docker", "yaml"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
