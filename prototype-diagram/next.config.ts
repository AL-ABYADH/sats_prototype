import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["@automerge/automerge"],
};

export default nextConfig;
