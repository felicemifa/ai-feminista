import { defineConfig, loadEnv } from "vite";
import fable from "vite-plugin-fable";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [fable()],
    server: {
      port: 5173,
      proxy: {
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, "/v1"),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader(
                "x-api-key",
                env.ANTHROPIC_API_KEY ?? env.VITE_ANTHROPIC_API_KEY ?? ""
              );
              proxyReq.setHeader("anthropic-version", "2023-06-01");
              proxyReq.setHeader("anthropic-dangerous-direct-browser-access", "true");
              proxyReq.setHeader("content-type", "application/json");
              proxyReq.removeHeader("origin");
              proxyReq.removeHeader("referer");
            });
          }
        }
      }
    }
  };
});
