import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Ports and the proxy target come from .env / .env.development, which used to be
// read by react-scripts. loadEnv with an empty prefix keeps that behaviour: these
// are build-machine settings, not values inlined into the bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backendPort = env.ASPNETCORE_HTTPS_PORT || env.AWPS_TUNNEL_SERVER_PORT;
  const target = env.ASPNETCORE_URLS
    ? env.ASPNETCORE_URLS.split(";")[0]
    : backendPort
      ? `http://localhost:${backendPort}`
      : "http://localhost:18274";

  const proxy = {
    target,
    secure: false,
    ws: true,
    headers: { Connection: "Keep-Alive" },
  };

  return {
    plugins: [react()],
    // The tunnel server serves this app from the filesystem root of dist/client,
    // so assets must be requested from / rather than a hashed subpath.
    base: "/",
    build: {
      // server/package.json copies build/ into dist/client; renaming this breaks it.
      outDir: "build",
      sourcemap: true,
    },
    server: {
      port: env.PORT ? Number(env.PORT) : 44477,
      open: env.BROWSER !== "none",
      proxy: {
        "/dataHub": proxy,
        "/socket.io": proxy,
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
      css: true,
    },
  };
});
