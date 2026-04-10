import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize packages for proper serverless bundling
  serverExternalPackages: [
    "@neondatabase/serverless",
    "@querypanel/node-sdk",
    "@aws-sdk/rds-signer",
    "@aws-sdk/credential-provider-node",
  ],
};

export default nextConfig;
