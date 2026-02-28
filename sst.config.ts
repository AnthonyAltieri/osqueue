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

    // ── Dev mode: bucket only, local services ──
    if ($dev) {
      return {
        bucket: bucket.name,
        broker: `http://localhost:8080`,
        web: `http://localhost:3001`,
      };
    }

    // ── Production: single EC2 t2.micro (free tier) ──

    const region = aws.getRegionOutput().name;

    // ECR repository for Docker image
    const repo = new aws.ecr.Repository("OsqueueRepo", {
      name: `osqueue-${$app.stage}`,
      forceDelete: true,
    });

    // Build and push Docker image to ECR
    const { local } = await import("@pulumi/command");
    const imageTag = `deploy-${Date.now()}`;
    const dockerBuildPush = new local.Command("DockerBuildPush", {
      dir: $cli.paths.root,
      create: $resolve([repo.repositoryUrl, region]).apply(
        ([repoUrl, regionName]) => {
          const registry = repoUrl.split("/")[0];
          // Write auth token directly to avoid macOS keychain issues with docker login
          return [
            `TMPCONF=/tmp/ecr-docker-$$`,
            `mkdir -p $TMPCONF`,
            `PASS=$(aws ecr get-login-password --region ${regionName})`,
            `AUTH=$(printf 'AWS:%s' "$PASS" | base64)`,
            `printf '{"auths":{"${registry}":{"auth":"%s"}}}' "$AUTH" > $TMPCONF/config.json`,
            `docker buildx build --platform linux/amd64 -f infra/Dockerfile.ec2 -t ${repoUrl}:latest --load .`,
            `docker --config $TMPCONF push ${repoUrl}:latest`,
            `rm -rf $TMPCONF`,
          ].join(" && ");
        },
      ),
      triggers: [imageTag],
    });

    const domain = "osqueue.com";

    // ── Route53 DNS ──
    const zone = new aws.route53.Zone("OsqueueZone", {
      name: domain,
    });

    // ── ACM certificate (must be in us-east-1 for CloudFront) ──
    const usEast1 = new aws.Provider("UsEast1", { region: "us-east-1" });

    const cert = new aws.acm.Certificate("OsqueueCert", {
      domainName: domain,
      subjectAlternativeNames: [`*.${domain}`],
      validationMethod: "DNS",
    }, { provider: usEast1 });

    // DNS validation record for ACM
    const certValidationRecord = new aws.route53.Record("CertValidation", {
      zoneId: zone.zoneId,
      name: cert.domainValidationOptions[0].resourceRecordName,
      type: cert.domainValidationOptions[0].resourceRecordType,
      records: [cert.domainValidationOptions[0].resourceRecordValue],
      ttl: 60,
    });

    const certValidation = new aws.acm.CertificateValidation("OsqueueCertValidation", {
      certificateArn: cert.arn,
      validationRecordFqdns: [certValidationRecord.fqdn],
    }, { provider: usEast1 });

    // Security group: allow HTTP, SSH (no HTTPS — CloudFront terminates TLS)
    const sg = new aws.ec2.SecurityGroup("OsqueueSg", {
      description: "osqueue EC2 security group",
      ingress: [
        { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"], description: "HTTP" },
      ],
      egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
      ],
    });

    // IAM role for EC2 (S3 + ECR access)
    const role = new aws.iam.Role("OsqueueEc2Role", {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Principal: { Service: "ec2.amazonaws.com" },
            Effect: "Allow",
          },
        ],
      }),
    });

    // Scoped S3 policy: queue bucket (CRUD + list)
    new aws.iam.RolePolicy("OsqueueQueueBucketPolicy", {
      role: role.name,
      policy: bucket.arn.apply(arn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          Resource: `${arn}/*`,
        }, {
          Effect: "Allow",
          Action: ["s3:ListBucket"],
          Resource: arn,
        }],
      })),
    });

    new aws.iam.RolePolicyAttachment("OsqueueEcrPolicy", {
      role: role.name,
      policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    });

    const instanceProfile = new aws.iam.InstanceProfile("OsqueueEc2Profile", {
      role: role.name,
    });

    // Find latest Amazon Linux 2023 AMI
    const ami = aws.ec2.getAmiOutput({
      mostRecent: true,
      owners: ["amazon"],
      filters: [
        { name: "name", values: ["al2023-ami-2023.*-x86_64"] },
        { name: "virtualization-type", values: ["hvm"] },
      ],
    });

    // User data script: install Docker, pull image from ECR, run container
    const userData = $resolve([repo.repositoryUrl, bucket.name, region]).apply(
      ([repoUrl, bucketName, regionName]) => {
        const imageUri = `${repoUrl}:latest`;
        const envFlags = [
          `-e DOMAIN=${domain}`,
          `-e STORAGE_BACKEND=s3`,
          `-e S3_BUCKET=${bucketName}`,
          `-e S3_REGION=${regionName}`,
          `-e GROUP_COMMIT_INTERVAL_MS=200`,
          `-e BROKER_HEARTBEAT_INTERVAL_MS=15000`,
          `-e BROKER_HEARTBEAT_TIMEOUT_MS=60000`,
          `-e S3_MAX_WRITES_PER_DAY=10000`,
          `-e S3_MAX_WRITES_PER_MINUTE=30`,
          `-e S3_MAX_READS_PER_MINUTE=0`,
        ].join(" ");

        return `#!/bin/bash
# Deploy: ${imageTag}
set -ex
yum update -y
yum install -y docker
systemctl enable docker
systemctl start docker

# Login to ECR
aws ecr get-login-password --region ${regionName} | docker login --username AWS --password-stdin ${repoUrl.split("/")[0]}

# Pull and run
docker pull ${imageUri}
docker run -d --restart=always --name osqueue \\
  --network host \\
  ${envFlags} \\
  ${imageUri}
`;
      },
    );

    // EC2 instance (t2.micro = free tier)
    const instance = new aws.ec2.Instance("OsqueueInstance", {
      ami: ami.id,
      instanceType: "t2.micro",
      iamInstanceProfile: instanceProfile.name,
      vpcSecurityGroupIds: [sg.id],
      userData: userData,
      userDataReplaceOnChange: true,
      tags: { Name: `osqueue-${$app.stage}` },
    }, { dependsOn: [dockerBuildPush] });

    // Elastic IP (free when attached to running instance)
    const eip = new aws.ec2.Eip("OsqueueEip", {
      instance: instance.id,
      tags: { Name: `osqueue-${$app.stage}` },
    });

    // Origin DNS record: CloudFront needs a domain name, not an IP
    new aws.route53.Record("DnsOrigin", {
      zoneId: zone.zoneId,
      name: `origin.${domain}`,
      type: "A",
      ttl: 300,
      records: [eip.publicIp],
    });

    // ── CloudFront distribution (TLS termination) ──
    const cdn = new aws.cloudfront.Distribution("OsqueueCdn", {
      enabled: true,
      aliases: [domain, `demo.${domain}`, `api.${domain}`],
      origins: [{
        domainName: `origin.${domain}`,
        originId: "ec2",
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "http-only",
          originSslProtocols: ["TLSv1.2"],
        },
      }],
      defaultCacheBehavior: {
        targetOriginId: "ec2",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad", // CachingDisabled
        originRequestPolicyId: "216adef6-5c7f-47e4-b989-5492eafa07d3", // AllViewer
      },
      viewerCertificate: {
        acmCertificateArn: certValidation.certificateArn,
        sslSupportMethod: "sni-only",
        minimumProtocolVersion: "TLSv1.2_2021",
      },
      restrictions: {
        geoRestriction: {
          restrictionType: "none",
        },
      },
      priceClass: "PriceClass_100",
    });

    // ── DNS records: root, demo, api → CloudFront ──
    new aws.route53.Record("DnsRoot", {
      zoneId: zone.zoneId,
      name: domain,
      type: "A",
      aliases: [{
        name: cdn.domainName,
        zoneId: cdn.hostedZoneId,
        evaluateTargetHealth: false,
      }],
    });

    new aws.route53.Record("DnsDemo", {
      zoneId: zone.zoneId,
      name: `demo.${domain}`,
      type: "A",
      aliases: [{
        name: cdn.domainName,
        zoneId: cdn.hostedZoneId,
        evaluateTargetHealth: false,
      }],
    });

    new aws.route53.Record("DnsApi", {
      zoneId: zone.zoneId,
      name: `api.${domain}`,
      type: "A",
      aliases: [{
        name: cdn.domainName,
        zoneId: cdn.hostedZoneId,
        evaluateTargetHealth: false,
      }],
    });

    return {
      bucket: bucket.name,
      broker: `https://api.${domain}`,
      docs: `https://${domain}`,
      demo: `https://demo.${domain}`,
      instanceId: instance.id,
      publicIp: eip.publicIp,
      domain,
      nameservers: zone.nameServers,
    };
  },
});
