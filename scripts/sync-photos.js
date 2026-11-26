import { randomUUID } from 'node:crypto';
import { link, mkdtemp, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertCurrentPhotoCatalog, readPhotoCatalog, reportPendingAnnotations, savePhotoCatalog } from './build-photos.js';
import { imageType, isPhotoPath, originalKey } from '../src/originals.js';
import { originalHash, photoTarget, readLocalOriginal } from './original-files.js';

async function restoreOriginal(storage, directory, entry) {
    const target = await photoTarget(directory, entry.file, true);
    const temporary = path.join(path.dirname(target), `.frame-download-${randomUUID()}`);
    // Older annotations can be restored from a manually uploaded filename-based object.
    const key = entry.sha256 ? originalKey(entry.sha256) : entry.file;
    try {
        await storage.download(key, temporary);
        const bytes = await readFile(temporary);
        if (entry.sha256 && originalHash(bytes) !== entry.sha256) {
            throw new Error('R2 原圖的 SHA-256 與 annotations.json 不符。');
        }
        // A file created during download must keep its contents.
        try {
            await link(temporary, target);
        } catch (error) {
            if (error.code !== 'EEXIST' || !(await readLocalOriginal(directory, entry.file)).equals(bytes)) throw error;
        }
        return bytes;
    } finally {
        await rm(temporary, { force: true });
    }
}

export async function markPhotoDeleted(catalog, file) {
    if (!file || !isPhotoPath(file)) throw new Error('用法：npm run photos:remove -- "pic/ 下的照片相對路徑"');
    const entry = catalog.matched.find(photo => photo.file === file);
    if (!entry) throw new Error(`找不到照片：${file}`);
    if (entry.deleted) return;
    if (entry.present && !entry.sha256) {
        entry.sha256 = originalHash(await readLocalOriginal(catalog.originals, entry.file));
    }
    entry.deleted = true;
    await savePhotoCatalog(catalog);
}

export async function syncPhotoDeletions(catalog, removeObject, file) {
    const deleted = catalog.matched.filter(entry => entry.deleted && (file === undefined || entry.file === file));
    if (!deleted.length) return;
    const activeHashes = new Set(catalog.matched.filter(entry => !entry.deleted).map(entry => entry.sha256).filter(Boolean));
    const pending = deleted.filter(entry => entry.r2Deletion !== 'complete'
        && !(entry.r2Deletion === 'shared' && activeHashes.has(entry.sha256)));
    for (const entry of deleted) {
        if (!entry.present) continue;
        await assertCurrentPhotoCatalog(catalog);
        const target = await photoTarget(catalog.originals, entry.file);
        if (file !== undefined) {
            await rm(target);
        } else {
            const conflict = entry.file + ' 已標記刪除，但無法確認本機檔案是原照片。若是要另外收錄的新照片，請改名；若是舊版本或已刪除的照片，請刪除或移出 pic/。處理後再執行 npm run photos:sync。';
            if (!entry.sha256 || originalHash(await readLocalOriginal(catalog.originals, entry.file)) !== entry.sha256) {
                throw new Error(conflict);
            }
            // Check the exact file removed from the gallery even if another process replaced it.
            const backup = await mkdtemp(path.join(catalog.originals, '.frame-backup-'));
            const staged = path.join(backup, path.basename(target));
            await rename(target, staged);
            if (originalHash(await readLocalOriginal(backup, path.basename(target))) !== entry.sha256) {
                throw new Error(conflict + ' 同步期間變更的檔案已保留在 ' + staged);
            }
            await rm(staged);
            await rmdir(backup);
        }
        console.log(`已刪除本機原圖 ${entry.file}`);
    }

    const removedKeys = new Set();
    for (const entry of pending) {
        try {
            const shared = activeHashes.has(entry.sha256);
            const keys = [];
            if (entry.r2Deletion !== 'shared') keys.push(entry.file);
            if (entry.sha256 && !shared) keys.push(originalKey(entry.sha256));
            for (const key of keys) {
                if (removedKeys.has(key)) continue;
                await assertCurrentPhotoCatalog(catalog);
                await removeObject(key);
                removedKeys.add(key);
            }
            entry.r2Deletion = shared ? 'shared' : 'complete';
            await savePhotoCatalog(catalog);
            console.log(shared ? `已保留其他照片共用的 R2 原檔：${entry.file}` : `已同步 R2 刪除 ${entry.file}`);
        } catch (error) {
            throw new Error(`${entry.file}：R2 刪除失敗，下次同步會重試。\n${error.message}`, { cause: error });
        }
    }
}

export async function syncPhotos(projectDir, storage, catalog) {
    catalog ??= await readPhotoCatalog(projectDir);
    await syncPhotoDeletions(catalog, key => storage.remove(key));
    const active = catalog.matched.filter(entry => !entry.deleted);

    const known = new Set(active.map(entry => entry.sha256).filter(Boolean));
    const uploads = new Map();
    const temporary = await mkdtemp(path.join(projectDir, '.frame-sync-'));
    let downloaded = 0;
    try {
        for (const entry of active) {
            try {
                let bytes = entry.present ? await readLocalOriginal(catalog.originals, entry.file) : null;
                const localHash = bytes && originalHash(bytes);
                if (bytes && entry.sha256 && localHash !== entry.sha256) {
                    throw new Error('本機檔案與已登錄的 SHA-256 不同。若是要另外收錄的新照片，請改名；若是舊版本或已刪除的照片，請刪除或移出 pic/。處理後再執行 npm run photos:sync。');
                }
                if (!bytes) {
                    bytes = await restoreOriginal(storage, catalog.originals, entry);
                    downloaded++;
                    console.log(`已下載 ${entry.file}`);
                }
                if (entry.sha256) continue;
                const hash = localHash || originalHash(bytes);
                if (known.has(hash)) {
                    entry.sha256 = hash;
                    continue;
                }
                if (!uploads.has(hash)) {
                    const snapshot = path.join(temporary, hash);
                    await writeFile(snapshot, bytes);
                    uploads.set(hash, { file: entry.file, path: snapshot, size: bytes.length, entries: [] });
                }
                uploads.get(hash).entries.push(entry);
            } catch (error) {
                throw new Error(`${entry.file}：${error.message}`, { cause: error });
            }
        }

        if (uploads.size) {
            const bytes = [...uploads.values()].reduce((size, upload) => size + upload.size, 0);
            await storage.checkUploadBudget(bytes);
        }
        for (const [hash, upload] of uploads) {
            const key = originalKey(hash);
            try {
                await storage.upload(key, upload.path, imageType(upload.file));
                const verification = path.join(temporary, 'verify');
                await storage.download(key, verification);
                if (originalHash(await readFile(verification)) !== hash) throw new Error('R2 上傳驗證失敗。');
                await rm(verification);
                for (const entry of upload.entries) entry.sha256 = hash;
                await savePhotoCatalog(catalog);
                console.log(`已上傳 ${upload.file}`);
            } catch (error) {
                throw new Error(`${upload.file}：${error.message}`, { cause: error });
            }
        }
        await savePhotoCatalog(catalog);
        reportPendingAnnotations(active);
        console.log(`原圖同步完成，共 ${active.length} 張，下載 ${downloaded} 張，上傳 ${uploads.size} 個原檔。`);
    } finally {
        await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
    }
}
