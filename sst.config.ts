/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "osqueue",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const bucket = new sst.aws.Bucket("QueueBucket");
    const vpc = new sst.aws.Vpc("QueueVpc");
    const cluster = new sst.aws.Cluster("QueueCluster", { vpc });

    const broker = cluster.addService("Broker", {
      link: [bucket],
      cpu: "0.25 vCPU",
      memory: "0.5 GB",
      health: {
        path: "/healthz",
        interval: "10 seconds",
      },
      loadBalancer: {
        ports: [{ listen: "80/http", forward: "8080/http" }],
      },
      image: {
        dockerfile: "infra/Dockerfile.broker",
      },
      environment: {
        STORAGE_BACKEND: "s3",
        S3_BUCKET: bucket.name,
        BROKER_HOST: "0.0.0.0",
        BROKER_PORT: "8080",
      },
      dev: {
        command: "bun run apps/src/broker.ts",
      },
    });

    const brokerUrl = broker.loadBalancer
      ? $interpolate`http://${broker.loadBalancer.dnsName}`
      : `http://${process.env.DEV_HOST ?? "localhost"}:8080`;

    const web = new sst.aws.TanStackStart("Web", {
      path: "packages/web/",
      link: [bucket],
      environment: {
        VITE_BROKER_URL: brokerUrl,
      },
      dev: {
        command: "bun run dev --host 0.0.0.0 --port 3001",
      },
    });

    return {
      web: web.url,
      broker: brokerUrl,
    };
  },
});
