/**
 * Bridge Node.js http IncomingMessage/ServerResponse ↔ Web Request/Response.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

const DEFAULT_MAX_BODY = 1_000_000; // 1MB

export async function nodeRequestToWeb(
  req: IncomingMessage,
  opts?: { maxBodyBytes?: number; baseUrl?: string },
): Promise<Request> {
  const maxBody = opts?.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const host = req.headers.host ?? "localhost";
  const proto =
    (typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0]?.trim()
      : undefined) ?? "http";
  const base = opts?.baseUrl ?? `${proto}://${host}`;
  const url = new URL(req.url ?? "/", base);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const method = (req.method ?? "GET").toUpperCase();
  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req, maxBody);
  }

  return new Request(url, {
    method,
    headers,
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    // @ts-expect-error undici/node duplex requirement for Request with body
    duplex: body && body.length > 0 ? "half" : undefined,
  });
}

function readBody(req: IncomingMessage, maxBody: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBody) {
        reject(Object.assign(new Error("Request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function webResponseToNode(
  webRes: Response,
  nodeRes: ServerResponse,
): Promise<void> {
  nodeRes.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    // Node handles set-cookie specially; skip hop-by-hop if needed
    if (key.toLowerCase() === "transfer-encoding") return;
    nodeRes.setHeader(key, value);
  });

  if (!webRes.body) {
    nodeRes.end();
    return;
  }

  const reader = webRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const ok = nodeRes.write(Buffer.from(value));
        if (!ok) {
          await new Promise<void>((resolve) => nodeRes.once("drain", resolve));
        }
      }
    }
    nodeRes.end();
  } catch (err) {
    reader.cancel().catch(() => undefined);
    if (!nodeRes.writableEnded) nodeRes.destroy(err as Error);
  }
}

/** Convert a Web Response body stream into a Node Readable (unused helper). */
export function webBodyToNodeStream(
  body: ReadableStream<Uint8Array> | null,
): Readable | null {
  if (!body) return null;
  return Readable.fromWeb(body as import("node:stream/web").ReadableStream);
}
