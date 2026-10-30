
import { timingSafeEqual } from "node:crypto";

const OWNER = "marlinfintech";
const REPO = "marlinfintech.github.io";

const ALLOWED_ORIGIN =
  "https://marlinfintech.github.io";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers":
        "Content-Type, X-Admin-Password",
      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS"
    }
  });
}

function safeEqual(a, b) {
  if (!a || !b) return false;

  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length &&
    timingSafeEqual(x, y);
}

function validPath(path) {
  if (typeof path !== "string") return false;

  if (path === "index.json") return true;

  if (!path.startsWith("assets/")) return false;

  return !path.split("/").some(
    part => !part || part === "." || part === ".."
  );
}

export default async (req) => {
  if (req.headers.get("origin") !== ALLOWED_ORIGIN) {
    return json({ error: "Origin not allowed" }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Headers":
          "Content-Type, X-Admin-Password",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const password = req.headers.get("X-Admin-Password");

  if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!process.env.GITHUB_TOKEN) {
    return json({ error: "GitHub token not configured" }, 500);
  }

  try {
    const { action, path, content, sha, message } =
      await req.json();

    if (!validPath(path)) {
      return json({ error: "Invalid file path" }, 400);
    }

    const operations = {
      read: "GET",
      upload: "PUT",
      delete: "DELETE"
    };

    const method = operations[action];

    if (!method) {
      return json({ error: "Invalid action" }, 400);
    }

    if (action === "upload" &&
        typeof content !== "string") {
      return json({ error: "Invalid content" }, 400);
    }

    if (action === "delete" &&
        typeof sha !== "string") {
      return json({ error: "File SHA required" }, 400);
    }

    const url =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

    const payload = {
      message: message || `Admin ${action}: ${path}`
    };

    if (action === "upload") {
      payload.content = content;
      if (sha) payload.sha = sha;
    }

    if (action === "delete") {
      payload.sha = sha;
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      ...(method !== "GET" && {
        body: JSON.stringify(payload)
      })
    });

    const result = await response.json();

    return json(result, response.status);

  } catch (error) {
    return json({
      error: "Backend operation failed"
    }, 500);
  }
};
