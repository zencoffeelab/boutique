import tailwindcss from "@tailwindcss/vite";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  if (mode !== "test") {
    const fileEnvironment = loadEnv(mode, process.cwd(), "");
    for (const [name, value] of Object.entries(fileEnvironment)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: { tsconfigPaths: true },
    server: {
      port: 5173,
    },
  };
});
