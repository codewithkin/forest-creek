import "@forest-creek/env/web";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  output: "standalone",
  // Room/property images come from Cloudflare R2. The current code uses plain
  // <img>, which ignores this block, but next/image would refuse the host
  // without it — keep it so switching to <Image> can't silently break images.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "pub-c7dca0170fc54d3f90adb45158a92059.r2.dev" }],
  },
};

export default nextConfig;
