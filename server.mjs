import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const minuteRateLimit = 8;
const hourRateLimit = 60;
const selfPingEnabled =
  process.env.SELF_PING_ENABLED === "true"
  || (process.env.RENDER === "true" && process.env.SELF_PING_ENABLED !== "false");
let viteServerPromise;
const requestBuckets = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function anthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY ?? process.env.VITE_ANTHROPIC_API_KEY ?? "";
}

function clientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress ?? "unknown";
}

function pruneRateEntries(entries, now) {
  return entries.filter((timestamp) => now - timestamp < 60 * 60 * 1000);
}

function checkRateLimit(request) {
  const now = Date.now();
  const key = clientAddress(request);
  const existing = requestBuckets.get(key) ?? [];
  const recent = pruneRateEntries(existing, now);
  const minuteCount = recent.filter((timestamp) => now - timestamp < 60 * 1000).length;
  const hourCount = recent.length;

  if (minuteCount >= minuteRateLimit || hourCount >= hourRateLimit) {
    requestBuckets.set(key, recent);

    return {
      allowed: false,
      retryAfterSeconds: minuteCount >= minuteRateLimit ? 60 : 60 * 60,
      scope: minuteCount >= minuteRateLimit ? "minute" : "hour"
    };
  }

  recent.push(now);
  requestBuckets.set(key, recent);

  return { allowed: true };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] ?? "application/octet-stream";

  response.writeHead(200, { "content-type": contentType });
  createReadStream(filePath).pipe(response);
}

function selfPingTarget() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return new URL("/healthz", process.env.RENDER_EXTERNAL_URL).toString();
  }

  if (selfPingEnabled) {
    return `http://127.0.0.1:${port}/healthz`;
  }

  return null;
}

function scheduleSelfPing() {
  const target = selfPingTarget();

  if (!selfPingEnabled || !target) {
    return;
  }

  const delayMs = (9 + Math.random() * 2) * 60 * 1000;
  const timer = setTimeout(async () => {
    try {
      const response = await fetch(target, {
        method: "GET",
        headers: {
          "cache-control": "no-store"
        }
      });

      console.log(`[self-ping] ${response.status} ${target}`);
    } catch (error) {
      console.warn(
        `[self-ping] failed for ${target}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      scheduleSelfPing();
    }
  }, delayMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

async function getViteServer() {
  if (!viteServerPromise) {
    viteServerPromise = import("vite").then(async ({ createServer }) =>
      createServer({
        appType: "spa",
        configFile: path.join(__dirname, "vite.config.js"),
        root: __dirname,
        server: {
          middlewareMode: true
        }
      })
    );
  }

  return viteServerPromise;
}

async function handleAnthropicRequest(request, response) {
  const apiKey = anthropicApiKey();

  if (!apiKey) {
    sendJson(response, 503, {
      error: {
        type: "configuration_error",
        message: "ANTHROPIC_API_KEY is not configured on the server."
      }
    });
    return;
  }

  const limit = checkRateLimit(request);

  if (!limit.allowed) {
    response.writeHead(429, {
      "content-type": "application/json; charset=utf-8",
      "retry-after": String(limit.retryAfterSeconds)
    });
    response.end(
      JSON.stringify({
        error: {
          type: "rate_limit",
          message:
            limit.scope === "minute"
              ? "送信が少し速すぎます。少し落ち着いてから、もう一度声を上げてください。"
              : "今日はかなり活発に声が上がっています。少し時間を置いてから、また来てください。"
        }
      })
    );
    return;
  }

  try {
    const body = await readRequestBody(request);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body
    });

    const text = await upstream.text();

    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
    });
    response.end(text);
  } catch (error) {
    sendJson(response, 502, {
      error: {
        type: "upstream_error",
        message: error instanceof Error ? error.message : "Unknown server error"
      }
    });
  }
}

async function handleEnglishResponseLog(request, response) {
  try {
    const raw = await readRequestBody(request);
    const payload = JSON.parse(raw);

    const event = {
      event: "english_response_detected",
      at: new Date().toISOString(),
      userMode: payload.userMode ?? "unknown",
      category: payload.category ?? "other",
      userText: payload.userText ?? "",
      responseText: payload.responseText ?? "",
      responsePreview: payload.responsePreview ?? ""
    };

    console.log(`[english-response] ${JSON.stringify(event)}`);
    sendJson(response, 204, {});
  } catch (error) {
    sendJson(response, 400, {
      error: {
        type: "bad_log_payload",
        message: error instanceof Error ? error.message : "Invalid english-response payload"
      }
    });
  }
}

async function handleStaticRequest(urlPathname, response) {
  const normalizedPath = urlPathname === "/" ? "/index.html" : urlPathname;
  const requestedPath = path.join(distDir, normalizedPath);

  if (existsSync(requestedPath)) {
    sendFile(response, requestedPath);
    return;
  }

  const fallbackPath = path.join(distDir, "index.html");

  if (existsSync(fallbackPath)) {
    sendFile(response, fallbackPath);
    return;
  }

  sendJson(response, 404, {
    error: {
      type: "not_found",
      message: "Build output not found. Run `npm run build` first."
    }
  });
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, {
      error: {
        type: "bad_request",
        message: "Request URL is missing."
      }
    });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/healthz") {
    sendJson(response, 200, {
      ok: true,
      anthropicConfigured: Boolean(anthropicApiKey())
    });
    return;
  }

  if (request.method === "GET" && url.pathname =="/app-config.js") {
    response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    response.end(`window.__ANTHROPIC_ENABLED__ = ${JSON.stringify(Boolean(anthropicApiKey()))};`);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/anthropic/messages") {
    await handleAnthropicRequest(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logs/english-response") {
    await handleEnglishResponseLog(request, response);
    return;
  }

  if (!existsSync(distDir)) {
    const viteServer = await getViteServer();
    viteServer.middlewares(request, response, (error) => {
      if (error) {
        sendJson(response, 500, {
          error: {
            type: "vite_middleware_error",
            message: error instanceof Error ? error.message : "Unknown middleware error"
          }
        });
      }
    });
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await handleStaticRequest(url.pathname, response);
    return;
  }

  sendJson(response, 405, {
    error: {
      type: "method_not_allowed",
      message: "Method not allowed."
    }
  });
});

server.listen(port, host, () => {
  console.log(`AI Feminista production server is listening on http://${host}:${port}`);
  scheduleSelfPing();
});
