import { imageType, originalKey, originalsManifestPath, originalUrl, parseOriginalPath } from '../../src/originals.js';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const original = parseOriginalPath(new URL(request.url).pathname);
    if (!original) return new Response(null, { status: 404 });
    if (!env.ORIGINALS || !env.ASSETS) return new Response(null, { status: 503 });

    const manifest = await env.ASSETS.fetch(new URL(originalsManifestPath, request.url));
    if (!manifest.ok) return new Response(null, { status: 503 });
    const allowed = await manifest.json().catch(() => null);
    if (!allowed || typeof allowed !== 'object' || Array.isArray(allowed)) return new Response(null, { status: 503 });
    if (!Object.hasOwn(allowed, originalUrl(original.hash, original.file))) return new Response(null, { status: 404 });

    const key = originalKey(original.hash);
    const object = request.method === 'HEAD' ? await env.ORIGINALS.head(key) : await env.ORIGINALS.get(key);
    if (!object) return new Response(null, { status: 404 });

    const name = original.file.split('/').at(-1);
    const encodedName = encodeURIComponent(name).replace(/['()*]/g, character =>
        '%' + character.charCodeAt(0).toString(16).toUpperCase());
    return new Response(request.method === 'GET' ? object.body : null, {
        headers: {
            'Content-Type': imageType(name),
            'Content-Length': String(object.size),
            'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
