import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cors from "cors";
import express from "express";

const MAX_RESULT_FETCH_BYTES = 80 * 1024 * 1024;

/** SSRF guard: only https hosts that look like Mirelo/CDN asset URLs. */
function isAllowedMireloResultUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local")) return false;
    if (h.includes("mirelo")) return true;
    if (h.endsWith("amazonaws.com") || h.endsWith("amazonaws.com.cn")) return true;
    if (h.endsWith("cloudfront.net")) return true;
    if (h.endsWith("googleapis.com")) return true;
    if (h.endsWith("r2.cloudflarestorage.com")) return true;
    return false;
  } catch {
    return false;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const MIRELO_API_KEY = (process.env.MIRELO_API_KEY || "").trim();
const MIRELO_API_BASE_URL = (
  process.env.MIRELO_API_BASE_URL || "https://api.mirelo.ai"
).replace(/\/+$/, "");

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mireloKeyConfigured: Boolean(MIRELO_API_KEY) });
  });

  async function forwardToMirelo(res, upstreamPath, { method = "GET", jsonBody } = {}) {
    const url = `${MIRELO_API_BASE_URL}${upstreamPath}`;
    const headers = {};
    if (MIRELO_API_KEY) headers.Authorization = `Bearer ${MIRELO_API_KEY}`;
    const hasBody =
      jsonBody != null &&
      typeof jsonBody === "object" &&
      Object.keys(jsonBody).length > 0;
    if (hasBody) headers["Content-Type"] = "application/json";

    let upstreamRes;
    try {
      upstreamRes = await fetch(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(jsonBody) : undefined,
      });
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
      return;
    }

    const ct = upstreamRes.headers.get("content-type") || "application/json";
    const text = await upstreamRes.text();
    res.status(upstreamRes.status).setHeader("Content-Type", ct).send(text);
  }

  app.get("/api/mirelo/text-to-music/preflight", (req, res) => {
    const q = new URLSearchParams(req.query).toString();
    const pathSuffix = `/v2/text-to-music/v1.0/preflight${q ? `?${q}` : ""}`;
    forwardToMirelo(res, pathSuffix, { method: "GET" });
  });

  app.post("/api/mirelo/text-to-music/sync", (req, res) => {
    forwardToMirelo(res, "/v2/text-to-music/v1.0/sync", {
      method: "POST",
      jsonBody: req.body,
    });
  });

  app.post("/api/mirelo/text-to-music/jobs", (req, res) => {
    forwardToMirelo(res, "/v2/text-to-music/v1.0/jobs", {
      method: "POST",
      jsonBody: req.body,
    });
  });

  app.get("/api/mirelo/text-to-music/jobs/:id", (req, res) => {
    const id = encodeURIComponent(req.params.id);
    forwardToMirelo(res, `/v2/text-to-music/v1.0/jobs/${id}`, { method: "GET" });
  });

  app.post("/api/mirelo/fetch-result-url", async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "JSON body { url: string } required" });
      return;
    }
    if (!isAllowedMireloResultUrl(url)) {
      res.status(400).json({ error: "URL host is not allowed for fetch" });
      return;
    }

    let upstream;
    try {
      upstream = await fetch(url);
    } catch (e) {
      res.status(502).json({ error: String(e?.message || e) });
      return;
    }

    if (!upstream.ok) {
      const snippet = (await upstream.text()).slice(0, 500);
      res.status(502).json({ error: `Upstream HTTP ${upstream.status}`, detail: snippet });
      return;
    }

    const len = upstream.headers.get("content-length");
    if (len != null && Number(len) > MAX_RESULT_FETCH_BYTES) {
      res.status(413).json({ error: "Asset too large" });
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_RESULT_FETCH_BYTES) {
      res.status(413).json({ error: "Asset too large" });
      return;
    }

    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    res.status(200).setHeader("Content-Type", ct).send(buf);
  });

  return app;
}

export const app = createApp();
