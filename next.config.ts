import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Parent C:\Users\admin\package-lock.json otherwise wins, and (app) routes 404.
    root: path.join(__dirname),
  },
};

export default nextConfig;
