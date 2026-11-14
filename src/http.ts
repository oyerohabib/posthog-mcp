#!/usr/bin/env node
/**
 * Remote Streamable HTTP MCP entrypoint (Railway / public URL).
 * STDIO remains in src/index.ts — do not use this for local MCP config command mode.
 */
import { config as loadEnv } from "dotenv";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHttpApp } from "./http/app.js";
import { nodeRequestToWeb, webResponseToNode } from "./http/node-adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });
loadEnv();

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    !(process.env.MCP_API_KEY ?? "").trim()
  ) {
    console.error("[posthog-mcp-http] MCP_API_KEY is required in production");
    process.exit(1);
  }

  const app = createHttpApp();
  const server = createServer(async (req, res) => {
    try {
      const webReq = await nodeRequestToWeb(req);
      const webRes = await app.fetch(webReq);
      await webResponseToNode(webRes, res);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status: number }).status)
          : 500;
      if (!res.headersSent) {
        res.statusCode = status >= 400 && status < 600 ? status : 500;
        res.setHeader("Content-Type", "application/json");
        const message =
          status === 413 ? "Request body too large" : "Internal server error";
        res.end(JSON.stringify({ error: message }));
      } else {
        res.destroy();
      }
      if (status !== 413) {
        console.error(
          "[posthog-mcp-http] request error:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  });

  server.listen(PORT, HOST, () => {
    console.error(
      `[posthog-mcp-http] listening on http://${HOST}:${PORT} (MCP POST /mcp, health GET /health)`,
    );
  });
}

main().catch((err) => {
  console.error("[posthog-mcp-http] fatal:", err);
  process.exit(1);
});
