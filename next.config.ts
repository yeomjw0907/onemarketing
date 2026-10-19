import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["pg", "better-sqlite3"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/**": ["./assets/fonts/NanumGothic-Regular.ttf"],
    "/api/workflow/documents/*": [
      "./assets/templates/quote.xlsx",
      "./assets/fonts/NanumGothic-Regular.ttf",
    ],
  },
};
export default config;
