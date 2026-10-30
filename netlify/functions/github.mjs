const OWNER = "marlinfintech";
const REPO = "sample-bus-and-truck-importers";
const DEFAULT_BRANCH = "main";

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) {
    return false;
  }
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

import { timingSafeEqual } from "node:crypto";

function validPath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/")) {
    return false;
  }
  if (path === "index.json") return true;
  if (!path.startsWith("assets/")) return false;

  return path.split("/").every(
    part => part && part !== "." && part !== ".."
  );
}

export default async (req) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.get("origin") || "";

  if (!allowedOrigin || origin !== allowedOrigin) {
    return json({ error: "Origin not allowed." }, 403, allowedOrigin || "null");
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Vary": "Origin",
        "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, allowedOrigin);
  }

  if (!safeEqual(
    req.headers.get("X-Admin-Password"),
    process.env.ADMIN_PASSWORD
  )) {
    return json({ error: "Unauthorized." }, 401, allowedOrigin);
  }

  if (!process.env.GITHUB_TOKEN) {
    return json({ error: "GitHub token is not configured on Netlify." }, 500, allowedOrigin);
  }

  try {
    const body = await req.json();
    const { action, path, content, sha } = body;
    const branch = body.branch || DEFAULT_BRANCH;

    if (!validPath(path)) {
      return json({ error: "Invalid or disallowed repository path." }, 400, allowedOrigin);
    }

    if (!["read", "upload", "delete"].includes(action)) {
      return json({ error: "Unsupported action." }, 400, allowedOrigin);
    }

    if (action === "upload" && typeof content !== "string") {
      return json({ error: "File content is required." }, 400, allowedOrigin);
    }

    if (action === "delete" && typeof sha !== "string") {
      return json({ error: "File SHA is required for deletion." }, 400, allowedOrigin);
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = new URL(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`
    );

    if (action === "read") {
      url.searchParams.set("ref", branch);
    }

    const method = action === "read" ? "GET" : action === "upload" ? "PUT" : "DELETE";
    const payload = {
      message: body.message || `Admin ${action}: ${path}`,
      branch
    };

    if (action === "upload") {
      payload.content = content;
      if (sha) payload.sha = sha;
    }

    if (action === "delete") {
      payload.sha = sha;
    }

    const githubResponse = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(payload) })
    });

    const text = await githubResponse.text();
    let result = {};
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        result = { message: text };
      }
    }

    return json(result, githubResponse.status, allowedOrigin);
  } catch (error) {
    return json({ error: "Request failed. Check the function logs." }, 500, allowedOrigin);
  }
};
