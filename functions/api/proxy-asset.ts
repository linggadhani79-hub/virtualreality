// Cloudflare Pages Function: pengganti endpoint Express /api/proxy-asset.
// Meneruskan unduhan aset 3D dari Firebase Storage agar tidak terblokir CORS.

const ALLOWED_HOSTS = ["firebasestorage.googleapis.com", "storage.googleapis.com"];

function isAllowed(host: string) {
  return ALLOWED_HOSTS.includes(host) || host.endsWith(".firebasestorage.app");
}

export const onRequestGet = async (context: { request: Request }) => {
  const target = new URL(context.request.url).searchParams.get("url");
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
};
