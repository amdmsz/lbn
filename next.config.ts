import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.31.128"],
  devIndicators: false,
  distDir: ".next-crm",
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "bullmq"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
