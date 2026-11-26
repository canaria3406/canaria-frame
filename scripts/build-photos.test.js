import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { buildPhotos } from './build-photos.js';
import { originalHash } from './original-files.js';
import { renderArchive } from '../src/main.js';

test('the archive keeps capture order and orientation without publishing original EXIF', async t => {
    const project = await mkdtemp(path.join(tmpdir(), 'frame-photo-test-'));
    t.after(() => rm(project, { recursive: true, force: true, maxRetries: 3 }));
    const sources = path.join(project, 'pic');
    const annotations = path.join(project, 'annotations.json');
    const output = path.join(project, 'dist');
    await mkdir(sources);
    const camera = (background, tags) => sharp({ create: { width: 100, height: 75, channels: 3, background } })
        .withMetadata({ orientation: 6 })
        .withExif({
            IFD0: { Make: 'Example', Model: 'Camera' },
            IFD2: tags,
            IFD3: {
                GPSLatitudeRef: 'N', GPSLatitude: '0/1 30/1 0/1',
                GPSLongitudeRef: 'E', GPSLongitude: '0/1 30/1 0/1'
            }
        }).jpeg().toBuffer();
    const tags = {
        DateTimeOriginal: '2025:12:31 23:45:00', OffsetTimeOriginal: '+08:00',
        ExposureTime: '1/125', FNumber: '28/10', ISOSpeedRatings: '400', FocalLength: '23/1', LensModel: 'Example Lens',
    };
    await writeFile(path.join(sources, 'a.jpg'), await camera('red', tags));
    await writeFile(path.join(sources, 'b.jpg'), await camera('blue', { DateTimeOriginal: '2026:01:01 00:15:00', OffsetTimeOriginal: '   :  ' }));
    await writeFile(annotations, '');
    const warnings = t.mock.method(console, 'warn', () => {});

    const [first, second] = await buildPhotos(output, project);
    assert.equal(first.original.name, 'a.jpg');
    assert.equal(first.date, '2026-01-01');
    assert.equal(second.original.name, 'b.jpg');
    assert.equal(second.date, '2026-01-01');
    assert.equal(second.capturedAt, '2025-12-31T15:15:00.000Z');
    assert.equal(first.capturedAt, '2025-12-31T15:45:00.000Z');
    assert.deepEqual(first.exif, {
        shutterSpeed: '1/125 s', aperture: 'ƒ/2.8', iso: 400, focalLength: '23 mm',
        camera: 'Example Camera', lens: 'Example Lens',
    });
    assert.deepEqual(second.exif, { camera: 'Example Camera' });
    assert.equal(await readFile(annotations, 'utf8'), '');
    assert.equal(first.prefectureID, 'unknown');
    assert.equal(warnings.mock.callCount(), 1);
    const preview = await sharp(await readFile(path.join(output, first.src))).metadata();
    assert.deepEqual([first.width, first.height, preview.width, preview.height], [75, 100, 75, 100]);
    assert.equal(preview.exif, undefined);
    assert.equal(preview.xmp, undefined);
    assert.equal(preview.iptc, undefined);

    await writeFile(path.join(sources, 'a.jpg'), await camera('green', tags));
    const replacement = (await buildPhotos(output, project)).find(photo => photo.original.name === 'a.jpg');
    assert.notEqual(replacement.src, first.src);
    const undated = await sharp({ create: { width: 80, height: 60, channels: 3, background: 'green' } }).jpeg().toBuffer();
    await writeFile(path.join(sources, 'a.jpg'), undated);
    const photos = await buildPhotos(output, project);
    assert.deepEqual(photos.map(photo => [photo.original.name, photo.date]), [['b.jpg', '2026-01-01'], ['a.jpg', null]]);
    assert.deepEqual(photos[1].exif, {});
    assert.match(renderArchive(photos), /日期未知/);
});

test('build previews normalized places and keeps the annotations untouched', async t => {
    const project = await mkdtemp(path.join(tmpdir(), 'frame-catalog-test-'));
    t.after(() => rm(project, { recursive: true, force: true, maxRetries: 3 }));
    const originals = path.join(project, 'pic');
    const catalog = path.join(project, 'annotations.json');
    const output = path.join(project, 'output');
    await mkdir(path.join(originals, 'trip'), { recursive: true });
    const pixels = sharp({ create: { width: 80, height: 60, channels: 3, background: 'teal' } });
    const photo = await pixels.withExif({ IFD2: { DateTimeOriginal: '2026:11:18 10:30:00' } }).jpeg().toBuffer();
    const filename = '海辺 #1.jpg';
    const annotationKey = 'trip/' + filename;
    await writeFile(path.join(originals, 'trip', filename), photo);
    await writeFile(path.join(originals, 'existing.jpg'), photo);
    const existing = { id: 'coast', alt: 'A tree beside the sea', prefectureId: 'jp-17',
        prefecture: { en: 'Ishikawa', 'zh-Hant': '石川縣' }, city: 'Hakusan' };
    const data = { 'existing': existing, 'removed.jpg': { alt: 'An old photo' } };
    await writeFile(catalog, JSON.stringify(data));
    const warnings = t.mock.method(console, 'warn', () => {});
    await assert.rejects(buildPhotos(output, project), /缺少本機原圖[\s\S]*removed\.jpg/);
    assert.equal(await readFile(catalog, 'utf8'), JSON.stringify(data));
    delete data['removed.jpg'];
    data[annotationKey] = { prefecture: { ja: '京都府' }, location: 'unknown' };
    await writeFile(catalog, JSON.stringify(data));

    const photos = await buildPhotos(output, project);
    const unknown = { 'zh-Hant': '未知', ja: '不明', en: 'Unknown' };
    const existingPhoto = photos.find(item => item.original.name === 'existing.jpg');
    assert.equal(existingPhoto.prefectureID, 'jp-17');
    assert.deepEqual(existingPhoto.prefecture, { 'zh-Hant': '石川縣', ja: '不明', en: 'Ishikawa' });
    assert.deepEqual(existingPhoto.city, { 'zh-Hant': 'Hakusan', ja: 'Hakusan', en: 'Hakusan' });
    assert.deepEqual(existingPhoto.location, unknown);
    const newPhoto = photos.find(item => item.original.name === filename);
    assert.deepEqual(newPhoto.location, unknown);
    for (const place of [null, '~']) {
        const html = renderArchive(photos, { mode: 'places', place, lang: 'ja' });
        assert.match(html, place ? /<h2>不明<\/h2>/ : /<strong>不明<\/strong>/);
    }
    assert.deepEqual(newPhoto.original, {
        url: `/originals/${originalHash(photo)}/trip/%E6%B5%B7%E8%BE%BA%20%231.jpg`,
        name: filename,
    });
    assert.ok(photos.every(item => !('id' in item) && !('alt' in item)));
    assert.match(renderArchive(photos, { mode: 'places' }), /href="#places\/jp-17"/);
    assert.match(renderArchive(photos), /aria-label="照片 existing\.jpg · .* · Hakusan"/);
    assert.ok(warnings.mock.calls[0].arguments[0].includes(annotationKey));

    const synchronized = await readFile(catalog, 'utf8');
    await buildPhotos(output, project);
    assert.equal(await readFile(catalog, 'utf8'), synchronized);
    assert.equal(warnings.mock.callCount(), 2);

    data[annotationKey] = { prefecture: 'Ishikawa', city: 'Hakusan', location: 'Tokumitsu Beach' };
    existing.prefecture.ja = '石川県';
    existing.location = 'Tokumitsu Beach';
    await writeFile(catalog, JSON.stringify(data));
    const updated = await buildPhotos(output, project);
    assert.equal(updated.find(item => item.original.name === filename).prefectureID, 'ishikawa');
    assert.equal(warnings.mock.callCount(), 2);
});
