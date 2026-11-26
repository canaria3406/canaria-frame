import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build, buildHasDeletedPhotos, discardBuild } from './build.js';
import { readPhotoCatalog } from './build-photos.js';
import { markPhotoDeleted, syncPhotoDeletions, syncPhotos } from './sync-photos.js';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
    process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
const require = createRequire(import.meta.url);
const wranglerPackage = require.resolve('wrangler/package.json');
const wrangler = path.resolve(path.dirname(wranglerPackage), require(wranglerPackage).bin.wrangler);
const exec = promisify(execFile);
const bucket = process.env.FRAME_R2_BUCKET || 'canaria-frame-originals';
const project = process.env.FRAME_PAGES_PROJECT || 'canaria-frame';
const storageLimit = Number(process.env.FRAME_R2_MAX_BYTES || 8_000_000_000);
let bucketInfo;

function remoteObjectPath(key) {
    // Wrangler passes the key segments to the REST API URL.
    return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function runWrangler(args) {
    try {
        const result = await exec(process.execPath, [wrangler, ...args], { cwd: root });
        return result.stdout;
    } catch (error) {
        const details = [error.stderr?.trim(), error.stdout?.trim()].filter(Boolean).join('\n');
        throw new Error(`Wrangler ${args.slice(0, 3).join(' ')} 失敗。請核對 .env 的 Cloudflare 憑證、帳戶和資源名稱，權限設定見 README。\n${details}`, { cause: error });
    }
}

async function readBucketInfo() {
    bucketInfo ??= JSON.parse(await runWrangler(['r2', 'bucket', 'info', bucket, '--json']));
    return bucketInfo;
}

const storage = {
    async download(key, target) {
        await runWrangler(['r2', 'object', 'get', remoteObjectPath(key), '--remote', '--file', target]);
    },
    async upload(key, source, type) {
        await runWrangler(['r2', 'object', 'put', remoteObjectPath(key), '--remote', '--file', source,
            '--content-type', type, '--storage-class', 'Standard']);
    },
    async remove(key) {
        // A missing object is a successful Wrangler delete; verify the bucket first.
        await readBucketInfo();
        const output = await runWrangler(['r2', 'object', 'delete', remoteObjectPath(key), '--remote']);
        if (output.includes('Operation cancelled.')) throw new Error('Wrangler 已取消刪除。');
    },
    async checkUploadBudget(additionalBytes) {
        if (!Number.isSafeInteger(storageLimit) || storageLimit <= 0 || storageLimit > 8_000_000_000) {
            throw new Error('FRAME_R2_MAX_BYTES 必須是介於 1 到 8000000000 的整數。');
        }
        const info = await readBucketInfo();
        if (info.default_storage_class !== 'Standard') throw new Error('R2 bucket 的預設儲存類別必須是 Standard。');
        const size = /^(\d+(?:\.\d+)?)\s+(B|kB|MB|GB|TB)$/.exec(info.bucket_size);
        if (!size) throw new Error('無法取得 R2 bucket 容量，已停止上傳。');
        const unit = ['B', 'kB', 'MB', 'GB', 'TB'].indexOf(size[2]);
        if (Number(size[1]) * 1000 ** unit + additionalBytes > storageLimit) {
            throw new Error(`R2 bucket 加上本次原圖後將超過 ${storageLimit} bytes，已停止上傳。`);
        }
    },
};

const command = process.argv[2];
const deleted = new Set();
try {
    if (![undefined, 'sync', 'remove', 'deploy'].includes(command)) {
        throw new Error('未知指令 ' + command + '。可用指令為 sync、remove、deploy。');
    }
    const catalog = await readPhotoCatalog(root);
    if (command === 'remove') {
        const file = process.argv[3];
        await markPhotoDeleted(catalog, file);
        deleted.add(file);
        await syncPhotoDeletions(catalog, key => storage.remove(key), file);
        await build();
    } else {
        const deletions = catalog.matched.filter(entry => entry.deleted);
        for (const entry of deletions) deleted.add(entry.file);
        const pendingDeletion = deletions.some(entry => !entry.r2Deletion);
        await syncPhotos(root, storage, catalog);
        if (command === 'deploy' || pendingDeletion || await buildHasDeletedPhotos(root, deleted)) {
            await build({ requireSynced: command === 'deploy' });
        }
    }
    if (command === 'deploy') {
        const branch = process.argv[3] || 'main';
        const child = spawn(process.execPath, [wrangler, 'pages', 'deploy', 'dist', '--project-name', project,
            '--branch', branch], { cwd: root, stdio: 'inherit' });
        await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', code => code === 0 ? resolve() : reject(new Error('Cloudflare Pages 部署失敗。')));
        });
    }
} catch (error) {
    console.error(error.message);
    try {
        if (await buildHasDeletedPhotos(root, deleted)) {
            try {
                await build();
            } catch (buildError) {
                await discardBuild(root);
                console.warn(`${buildError.message}\n已移除仍包含已刪除照片的舊 dist/。請重新同步並建置。`);
            }
        }
    } catch (cleanupError) {
        console.error(`無法移除舊 dist/：${cleanupError.message}`);
    }
    process.exitCode = 1;
}
