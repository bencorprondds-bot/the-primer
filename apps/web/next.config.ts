import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@primer/shared", "@primer/ui", "@primer/math-renderer"],
};

export default nextConfig;
