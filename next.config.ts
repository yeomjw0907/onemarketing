import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pg", "better-sqlite3"],
  poweredByHeader: false,
};
export default config;
