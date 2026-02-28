import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    {
      type: "category",
      label: "Getting Started",
      items: [
        "getting-started/installation",
        "getting-started/quickstart",
        "getting-started/web-dashboard",
      ],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/architecture",
        "concepts/how-it-works",
        "concepts/broker-election",
        "concepts/job-lifecycle",
        "concepts/typed-errors",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: [
        "guides/job-types",
        "guides/transport-plugins",
        "guides/storage-backends",
        "guides/throttling",
        "guides/concurrency",
        "guides/custom-transport",
      ],
    },
    {
      type: "category",
      label: "Deployment",
      items: [
        "deployment/local-dev",
        "deployment/aws-ec2",
        "deployment/configuration",
        "deployment/production-checklist",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: [
        "api/client",
        "api/broker",
        "api/worker",
        "api/storage",
        "api/types",
      ],
    },
    "contributing",
  ],
};

export default sidebars;
