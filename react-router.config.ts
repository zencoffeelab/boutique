import type { Config } from "@react-router/dev/config";

const isCloudflareBuild = process.env.WORKERS_CI === "1" || process.env.CLOUDFLARE_BUILD === "1";

export default {
  ssr: true,
  future: isCloudflareBuild ? { v8_viteEnvironmentApi: true } : undefined,
} satisfies Config;
