// Cloudflare Worker: menyajikan berkas aplikasi (folder dist) dan menggantikan endpoint
// Express /api/proxy-asset, yang meneruskan unduhan aset 3D dari Firebase Storage agar
// tidak terblokir CORS.

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const ALLOWED_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];

function isAllowed(host: string) {
  return ALLOWED_HOSTS.includes(host) || host.endsWith(".firebasestorage.app");
}

async function proxyAsset(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("Missing url parameter", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url parameter", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !isAllowed(parsed.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), { cf: { cacheEverything: true, cacheTtl: 86400 } } as RequestInit);
  if (!upstream.ok) return new Response(upstream.statusText, { status: upstream.status });

  const headers = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=86400");
  return new Response(upstream.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/proxy-asset" && request.method === "GET") return proxyAsset(request);
    if (url.pathname.startsWith("/api/")) {
      return new Response("Endpoint ini hanya tersedia di server Node (AI Studio).", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
