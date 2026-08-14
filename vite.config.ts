import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const isCloudflareBuild = process.env.WORKERS_CI === "1" || process.env.CLOUDFLARE_BUILD === "1";

  if (mode !== "test") {
    const fileEnvironment = loadEnv(mode, process.cwd(), "");
    for (const [name, value] of Object.entries(fileEnvironment)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }

  return {
    plugins: [
      tailwindcss(),
      reactRouter(),
      ...(isCloudflareBuild ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    ],
    resolve: { tsconfigPaths: true },
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "@supabase/ssr",
        "@supabase/supabase-js",
        "@tiptap/core",
        "@tiptap/extension-link",
        "@tiptap/react",
        "@tiptap/starter-kit",
        "clsx",
        "lucide-react",
        "radix-ui",
        "react",
        "react-dom/client",
        "react-router",
        "react-router/dom",
        "tailwind-merge",
        "yoastseo",
        "yoastseo/build/languageProcessing/languages/en/Researcher.js",
        "yoastseo/build/languageProcessing/languages/fr/Researcher.js",
        "zod",
      ],
    },
    server: {
      port: 5173,
    },
  };
});
