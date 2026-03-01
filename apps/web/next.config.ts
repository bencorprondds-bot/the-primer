import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@primer/shared", "@primer/ui"],
};

export default nextConfig;
