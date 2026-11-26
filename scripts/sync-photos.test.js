import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { onRequest } from '../functions/originals/[[photo]].js';
import { originalKey, originalsManifestPath, originalUrl } from '../src/originals.js';
import { readPhotoCatalog } from './build-photos.js';
import { build, buildHasDeletedPhotos, discardBuild } from './build.js';
import { originalHash } from './original-files.js';
import { markPhotoDeleted, syncPhotoDeletions, syncPhotos } from './sync-photos.js';

async function fixture(t, annotations, objects = new Map()) {
    const project = await mkdtemp(path.join(tmpdir(), 'frame-sync-test-'));
    t.after(() => rm(project, { recursive: true, force: true, maxRetries: 3 }));
    t.mock.method(console, 'log', () => {});
    t.mock.method(console, 'warn', () => {});
    const photos = path.join(project, 'pic');
    const catalog = path.join(project, 'annotations.json');
    await mkdir(photos);
    const initial = JSON.stringify(annotations);
    await writeFile(catalog, initial);
    const calls = [];
    const storage = {
        async checkUploadBudget(bytes) {
            calls.push(['budget', bytes]);
        },
        async download(key, target) {
            calls.push(['get', key]);
            const bytes = objects.get(key);
            if (!bytes) throw new Error('R2 object not found');
            await writeFile(target, bytes);
        },
        async upload(key, source, type) {
            calls.push(['put', key, type]);
            objects.set(key, await readFile(source));
        },
        async remove(key) {
            calls.push(['delete', key]);
            objects.delete(key);
        },
    };
    return { project, photos, catalog, initial, calls, storage };
}

test('sync skips matching files, restores missing originals and registers local additions', async t => {
    const present = Buffer.from('already synced original');
    const missing = Buffer.from('missing original');
    const added = Buffer.from('new local original');
    const presentHash = originalHash(present);
    const missingHash = originalHash(missing);
    const addedHash = originalHash(added);
    const downloadKey = originalKey(missingHash);
    const uploadKey = originalKey(addedHash);
    const { project, photos, catalog, calls, storage } = await fixture(t, {
        'present.jpg': { originalSha256: presentHash, city: 'Osaka' },
        'trip/海辺 #1.jpg': { originalSha256: missingHash, location: 'Beach' },
    }, new Map([[downloadKey, missing]]));
    await writeFile(path.join(photos, 'present.jpg'), present);
    await writeFile(path.join(photos, 'new.png'), added);
    await writeFile(path.join(photos, 'duplicate.png'), added);

    await syncPhotos(project, storage);
    assert.deepEqual(calls, [['get', downloadKey], ['budget', added.length],
        ['put', uploadKey, 'image/png'], ['get', uploadKey]]);
    assert.deepEqual(await readFile(path.join(photos, 'trip', '海辺 #1.jpg')), missing);
    const updated = await readFile(catalog, 'utf8');
    const data = JSON.parse(updated);
    assert.equal(data['present.jpg'].city.en, 'Osaka');
    assert.equal(data['trip/海辺 #1.jpg'].location.en, 'Beach');
    const unknown = { 'zh-Hant': '未知', ja: '不明', en: 'Unknown' };
    assert.deepEqual(data['new.png'], { prefectureID: 'unknown', prefecture: unknown,
        city: unknown, location: unknown, originalSha256: addedHash });
    assert.equal(data['duplicate.png'].originalSha256, addedHash);
    calls.length = 0;
    await syncPhotos(project, storage);
    assert.deepEqual(calls, []);
    assert.equal(await readFile(catalog, 'utf8'), updated);
});

test('missing or corrupt R2 originals stop sync without saving annotations or partial images', async t => {
    const photo = Buffer.from('expected photo');
    const hash = originalHash(photo);
    const key = originalKey(hash);
    const objects = new Map();
    const { project, photos, catalog, initial, calls, storage } = await fixture(t, {
        'missing.jpg': { originalSha256: hash, city: 'Osaka' },
    }, objects);
    await writeFile(path.join(photos, 'added.jpg'), photo);

    await assert.rejects(syncPhotos(project, storage), /missing\.jpg：R2 object not found/);
    objects.set(key, Buffer.from('wrong bytes'));
    await assert.rejects(syncPhotos(project, storage), /missing\.jpg：R2 原圖的 SHA-256/);
    assert.equal(await readFile(catalog, 'utf8'), initial);
    assert.deepEqual(await readdir(photos), ['added.jpg']);
    assert.deepEqual(calls, [['get', key], ['get', key]]);
});

test('a filename conflict stops sync until renamed, then both photos and the legacy entry sync', async t => {
    const currentPhoto = Buffer.from('catalog version');
    const previousPhoto = Buffer.from('local version');
    const legacyPhoto = Buffer.from('legacy object');
    const hash = originalHash(currentPhoto);
    const legacy = 'trip/舊 照片.jpg';
    const { project, photos, catalog, storage } = await fixture(t, {
        'same.jpg': { originalSha256: hash }, [legacy]: { city: 'Tokyo' },
    }, new Map([[originalKey(hash), currentPhoto], [legacy, legacyPhoto]]));
    await writeFile(path.join(photos, 'same.jpg'), previousPhoto);
    await assert.rejects(syncPhotos(project, storage), /same.jpg：本機檔案與已登錄/);
    assert.deepEqual(await readFile(path.join(photos, 'same.jpg')), previousPhoto);
    await rename(path.join(photos, 'same.jpg'), path.join(photos, 'another.jpg'));
    await syncPhotos(project, storage);
    assert.deepEqual(await readFile(path.join(photos, 'same.jpg')), currentPhoto);
    assert.deepEqual(await readFile(path.join(photos, 'another.jpg')), previousPhoto);
    const data = JSON.parse(await readFile(catalog, 'utf8'));
    assert.equal(data[legacy].city.en, 'Tokyo');
    assert.equal(data[legacy].originalSha256, originalHash(legacyPhoto));
    assert.deepEqual(await readFile(path.join(photos, legacy)), legacyPhoto);
});

test('failed upload verification keeps the original catalog', async t => {
    const { project, photos, catalog, initial, storage } = await fixture(t, {});
    await writeFile(path.join(photos, 'new.jpg'), 'photo');
    storage.download = (_key, target) => writeFile(target, 'wrong photo');
    await assert.rejects(syncPhotos(project, storage), /R2 上傳驗證失敗/);
    assert.equal(await readFile(catalog, 'utf8'), initial);
});

test('deletion removes the local and remote original and rebuilds published files', async t => {
    const makePhoto = background => sharp({ create: { width: 48, height: 36, channels: 3, background } }).jpeg().toBuffer();
    const [removed, kept] = await Promise.all([makePhoto('red'), makePhoto('blue')]);
    const removedHash = originalHash(removed);
    const keptHash = originalHash(kept);
    const removedKey = originalKey(removedHash);
    const objects = new Map([[removedKey, removed], [originalKey(keptHash), kept]]);
    const { project, photos, catalog, calls, storage } = await fixture(t, {
        'removed.jpg': { originalSha256: removedHash, city: 'Osaka' },
        'kept.jpg': { originalSha256: keptHash },
    }, objects);
    await cp(new URL('../src/', import.meta.url), path.join(project, 'src'), { recursive: true });
    await mkdir(path.join(project, 'assets'));
    const local = path.join(photos, 'removed.jpg');
    await writeFile(local, removed);
    await writeFile(path.join(photos, 'kept.jpg'), kept);
    await build({ projectDir: project });
    const dist = path.join(project, 'dist');
    assert.equal(await readFile(path.join(dist, '_headers'), 'utf8'), '/gallery/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    const gallery = path.join(dist, 'gallery');
    assert.ok((await readdir(gallery)).some(name => name.startsWith('removed.')));

    const snapshot = await readPhotoCatalog(project);
    await markPhotoDeleted(snapshot, 'removed.jpg');
    await syncPhotoDeletions(snapshot, key => storage.remove(key), 'removed.jpg');
    await assert.rejects(readFile(local), { code: 'ENOENT' });
    assert.deepEqual(calls, [['delete', 'removed.jpg'], ['delete', removedKey]]);
    assert.equal(objects.has(removedKey), false);
    const deleted = JSON.parse(await readFile(catalog, 'utf8'))['removed.jpg'];
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.r2Deletion, 'complete');
    assert.equal(deleted.originalSha256, removedHash);
    assert.deepEqual(deleted, { city: 'Osaka', deleted: true, originalSha256: removedHash, r2Deletion: 'complete' });

    const deletedPaths = new Set(['removed.jpg']);
    assert.equal(await buildHasDeletedPhotos(project, deletedPaths), true);
    await build({ projectDir: project });
    assert.deepEqual((await readdir(gallery)).map(name => name.split('.')[0]), ['kept']);
    assert.deepEqual(JSON.parse(await readFile(path.join(dist, originalsManifestPath), 'utf8')), {
        [originalUrl(keptHash, 'kept.jpg')]: true,
    });
    assert.equal(await buildHasDeletedPhotos(project, deletedPaths), false);

    // Another checkout still had the deleted file when it got the updated catalog.
    calls.length = 0;
    await writeFile(local, removed);
    await syncPhotos(project, storage);
    await assert.rejects(readFile(local), { code: 'ENOENT' });
    assert.deepEqual(calls, []);
});

test('single-photo removal leaves drafts, missing originals, and other deletions pending', async t => {
    const removed = Buffer.from('remove only this original');
    const removedHash = originalHash(removed);
    const keep = Buffer.from('unpublished original');
    const { project, photos, catalog, calls, storage } = await fixture(t, {
        'remove.jpg': { originalSha256: removedHash },
        'missing.jpg': { originalSha256: originalHash(Buffer.from('remote only')) },
        'legacy.jpg': { city: 'Osaka' },
        'pending.jpg': { deleted: true },
    });
    for (const file of ['draft.jpg', 'legacy.jpg', 'pending.jpg']) {
        await writeFile(path.join(photos, file), keep);
    }
    await writeFile(path.join(photos, 'remove.jpg'), removed);

    const snapshot = await readPhotoCatalog(project);
    await markPhotoDeleted(snapshot, 'remove.jpg');
    await syncPhotoDeletions(snapshot, key => storage.remove(key), 'remove.jpg');

    assert.deepEqual(calls, [['delete', 'remove.jpg'], ['delete', originalKey(removedHash)]]);
    assert.deepEqual(await readdir(photos), ['draft.jpg', 'legacy.jpg', 'pending.jpg']);
    const annotations = JSON.parse(await readFile(catalog, 'utf8'));
    assert.equal(annotations['draft.jpg'], undefined);
    assert.equal(annotations['legacy.jpg'].originalSha256, undefined);
    assert.equal(annotations['pending.jpg'].r2Deletion, undefined);
    assert.equal(annotations['remove.jpg'].r2Deletion, 'complete');
});

test('a shared R2 object is removed when the last active photo is deleted', async t => {
    const bytes = Buffer.from('shared original');
    const hash = originalHash(bytes);
    const key = originalKey(hash);
    const objects = new Map([[key, bytes]]);
    const { project, photos, catalog, calls, storage } = await fixture(t, {
        'first.jpg': { originalSha256: hash }, 'second.jpg': { originalSha256: hash },
    }, objects);
    await writeFile(path.join(photos, 'first.jpg'), bytes);
    await writeFile(path.join(photos, 'second.jpg'), bytes);
    await markPhotoDeleted(await readPhotoCatalog(project), 'first.jpg');
    await syncPhotos(project, storage);
    assert.deepEqual(calls, [['delete', 'first.jpg']]);
    assert.equal(objects.has(key), true);
    assert.equal(JSON.parse(await readFile(catalog, 'utf8'))['first.jpg'].r2Deletion, 'shared');

    calls.length = 0;
    await syncPhotos(project, storage);
    assert.deepEqual(calls, []);
    await markPhotoDeleted(await readPhotoCatalog(project), 'second.jpg');
    await syncPhotos(project, storage);
    assert.deepEqual(calls, [['delete', key], ['delete', 'second.jpg']]);
    assert.equal(objects.has(key), false);
    assert.ok(Object.values(JSON.parse(await readFile(catalog, 'utf8'))).every(entry => entry.r2Deletion === 'complete'));
});

test('failed R2 deletion leaves a retryable tombstone and invalidates stale built files', async t => {
    const { project, photos, catalog, storage, calls } = await fixture(t, {});
    const local = path.join(photos, 'local.jpg');
    const localBytes = Buffer.from('local original');
    const key = originalKey(originalHash(localBytes));
    await writeFile(local, localBytes);
    await writeFile(path.join(photos, 'unrelated.jpg'), 'unpublished');
    const dist = path.join(project, 'dist');
    await mkdir(dist);
    await writeFile(path.join(dist, 'index.html'), 'outdated build without a manifest');
    const remove = storage.remove;
    storage.remove = async () => { throw new Error('R2 error'); };

    await markPhotoDeleted(await readPhotoCatalog(project), 'local.jpg');
    await assert.rejects(syncPhotos(project, storage), /local\.jpg：R2 刪除失敗/);
    await assert.rejects(readFile(local), { code: 'ENOENT' });
    const updated = JSON.parse(await readFile(catalog, 'utf8'));
    assert.equal(updated['local.jpg'].deleted, true);
    assert.equal(updated['local.jpg'].originalSha256, originalHash(localBytes));
    assert.equal(updated['local.jpg'].r2Deletion, undefined);
    assert.equal(updated['unrelated.jpg'], undefined);
    const deleted = new Set(['local.jpg']);
    assert.equal(await buildHasDeletedPhotos(project, deleted), true);
    await discardBuild(project);
    assert.equal(await buildHasDeletedPhotos(project, deleted), false);

    storage.remove = remove;
    await syncPhotos(project, storage);
    assert.deepEqual(calls.slice(0, 2), [['delete', 'local.jpg'], ['delete', key]]);
    assert.equal(JSON.parse(await readFile(catalog, 'utf8'))['local.jpg'].r2Deletion, 'complete');
});

test('Pages downloads the original bytes with one R2 read and preserves the download name', async () => {
    const bytes = Buffer.from('unmodified photograph');
    const hash = originalHash(bytes);
    const calls = [];
    const allowedUrl = originalUrl(hash, 'trip/海辺 #1.jpg');
    const env = { ASSETS: { fetch(url) {
        assert.equal(url.pathname, originalsManifestPath);
        return Response.json({ [allowedUrl]: true });
    } }, ORIGINALS: {
        get(key) {
            calls.push(['get', key]);
            return { body: bytes, size: bytes.length };
        },
        head(key) {
            calls.push(['head', key]);
            return { size: bytes.length };
        },
    } };
    const url = new URL(allowedUrl, 'https://frame.canaria.cc');
    const response = await onRequest({ request: new Request(url), env });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Disposition'), "attachment; filename*=UTF-8''%E6%B5%B7%E8%BE%BA%20%231.jpg");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    const head = await onRequest({ request: new Request(url, { method: 'HEAD' }), env });
    assert.equal(head.body, null);
    assert.equal(head.headers.get('Content-Length'), String(bytes.length));
    const bogus = await onRequest({ request: new Request(new URL('/originals/missing', url)), env });
    assert.equal(bogus.status, 404);
    const removed = await onRequest({ request: new Request(new URL(originalUrl(hash, 'deleted.jpg'), url)), env });
    assert.equal(removed.status, 404);
    assert.deepEqual(calls, [['get', originalKey(hash)], ['head', originalKey(hash)]]);
});

test('automatic deletion preserves unrelated local files and never infers a remote hash', async t => {
    for (const r2Deletion of [undefined, 'complete']) {
        for (const originalSha256 of [undefined, originalHash(Buffer.from('old'))]) {
            const { project, photos, catalog, initial, calls, storage } = await fixture(t, {
                'same.jpg': { deleted: true, r2Deletion, originalSha256 },
            });
            const target = path.join(photos, 'same.jpg');
            await writeFile(target, 'new');
            await assert.rejects(syncPhotos(project, storage), /same.jpg 已標記刪除/);
            assert.equal(await readFile(target, 'utf8'), 'new');
            assert.equal(await readFile(catalog, 'utf8'), initial);
            assert.deepEqual(calls, []);
        }
    }
});

test('ambiguous case and Unicode spellings stop sync before storage access', async t => {
    for (const alias of ['CAFÉ.JPG', 'cafe\u0301.jpg']) {
        const { project, photos, calls, storage } = await fixture(t, { [alias]: { deleted: true } });
        await writeFile(path.join(photos, 'café.jpg'), 'photo');
        await assert.rejects(syncPhotos(project, storage), /路徑只差大小寫或 Unicode/);
        assert.deepEqual(calls, []);
    }
});

test('retry uploads only content that has not passed verification', async t => {
    const { project, photos, catalog, calls, storage } = await fixture(t, {});
    for (const [file, bytes] of [['a.jpg', 'first'], ['b.jpg', 'second'], ['c.jpg', 'first']]) {
        await writeFile(path.join(photos, file), bytes);
    }
    const second = originalKey(originalHash(Buffer.from('second')));
    const upload = storage.upload;
    storage.upload = (...args) => {
        if (args[0] === second) throw new Error('interrupted');
        return upload(...args);
    };
    await assert.rejects(syncPhotos(project, storage), /interrupted/);
    const saved = JSON.parse(await readFile(catalog, 'utf8'));
    assert.deepEqual(Object.keys(saved), ['a.jpg', 'c.jpg']);
    assert.equal(saved['a.jpg'].originalSha256, saved['c.jpg'].originalSha256);
    calls.length = 0;
    storage.upload = upload;
    await syncPhotos(project, storage);
    assert.deepEqual(calls, [['budget', 6], ['put', second, 'image/jpeg'], ['get', second]]);
});
