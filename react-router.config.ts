import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

const isCloudflareBuild = process.env.WORKERS_CI === "1" || process.env.CLOUDFLARE_BUILD === "1";

export default {
  ssr: true,
  presets: isCloudflareBuild ? [] : [vercelPreset()],
  future: isCloudflareBuild ? { v8_viteEnvironmentApi: true } : undefined,
} satisfies Config;
