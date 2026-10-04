import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env for the whole monorepo; Next only looks inside apps/web by itself.
const rootEnv = "../../.env";
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {};

export default nextConfig;
