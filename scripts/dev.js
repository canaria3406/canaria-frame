import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageType, originalsManifestPath, originalUrl, parseOriginalPath } from '../src/originals.js';
import { originalHash, readLocalOriginal } from './original-files.js';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const originals = fileURLToPath(new URL('../pic/', import.meta.url));
const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
    '.jpg': 'image/jpeg',
};
const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname.startsWith('/originals/')) {
            const original = parseOriginalPath(url.pathname);
            if (!original) throw new Error();
            const allowed = JSON.parse(await readFile(path.join(root, originalsManifestPath), 'utf8'));
            if (!Object.hasOwn(allowed, originalUrl(original.hash, original.file))) throw new Error();
            const bytes = await readLocalOriginal(originals, original.file);
            if (originalHash(bytes) !== original.hash) throw new Error();
            response.writeHead(200, {
                'Content-Type': imageType(original.file), 'Content-Length': bytes.length,
                'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
            }).end(request.method === 'GET' ? bytes : undefined);
            return;
        }
        const filename = decodeURIComponent(url.pathname).slice(1) || 'index.html';
        const target = path.resolve(root, filename);
        const relative = path.relative(root, target);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error();
        const file = await stat(target);
        if (!file.isFile()) throw new Error();
        const ext = path.extname(target);
        response.writeHead(200, {
            'Content-Type': types[ext] || 'application/octet-stream',
            'Content-Length': file.size,
            'Cache-Control': ext === '.webp' ? 'public,max-age=31536000,immutable' : 'no-cache',
            'X-Content-Type-Options': 'nosniff',
        });
        if (request.method === 'HEAD') response.end();
        else createReadStream(target).on('error', () => response.destroy()).pipe(response);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        if (request.method === 'HEAD') response.end();
        else createReadStream(path.join(root, '404.html')).on('error', () => response.end('Not found')).pipe(response);
    }
});

const port = 3406;
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}/`));
