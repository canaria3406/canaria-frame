import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp from 'sharp';
import { imageType, isOriginalHash, isPhotoPath, originalUrl } from '../src/originals.js';
import { originalHash, readLocalOriginal } from './original-files.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const thumbnailWidths = [360, 640, 960, 1440];
const maximumEdge = 2400;
const quality = 84;
const recipe = JSON.stringify({ revision: 1, thumbnailWidths, maximumEdge, quality, sharp: sharp.versions });
const placeFields = ['prefecture', 'city', 'location'];
const exifFields = [
    'DateTimeOriginal', 'OffsetTimeOriginal', 'Make', 'Model', 'LensModel',
    'ExposureTime', 'FNumber', 'ISO', 'FocalLength',
];
const tokyoOffset = 9 * 60 * 60 * 1000;
const unknownPlace = { 'zh-Hant': '未知', ja: '不明', en: 'Unknown' };
const unknownValues = new Set(Object.values(unknownPlace));

async function imageFiles(directory, prefix = '') {
    const files = [];
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
        if (error.code === 'ENOENT' && !prefix) return [];
        throw error;
    });
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relative = prefix + entry.name;
        if (entry.isDirectory()) {
            files.push(...await imageFiles(path.join(directory, entry.name), relative + '/'));
        } else if (entry.isFile() && imageType(entry.name)) {
            files.push(relative);
        }
    }
    return files.sort();
}

function slug(value) {
    const clean = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return clean || createHash('sha256').update(value).digest('hex').slice(0, 12);
}

// Interpret EXIF without a time zone as Japan time on every build host.
function captureTime(input, defaultOffset) {
    const value = String(input ?? '').trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const parts = /^(\d{4}-\d\d-\d\d)(?:[T ](\d\d:\d\d)(?::(\d\d)(\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)?)?$/.exec(value);
    if (!parts) return null;
    const [, day, hours, seconds = '00', fraction = '', offset] = parts;
    const calendar = new Date(day + 'T00:00:00Z');
    if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== day) {
        return null;
    }
    if (hours && (Number(hours.slice(0, 2)) > 23 || Number(hours.slice(3)) > 59 || Number(seconds) > 59)) {
        return null;
    }
    const zone = offset || defaultOffset || '+09:00';
    const normalized = day + 'T' + (hours || '00:00') + ':' + seconds + fraction + zone;
    const instant = Date.parse(normalized);
    if (!Number.isFinite(instant)) return null;
    return { date: new Date(instant + tokyoOffset).toISOString().slice(0, 10), instant,
        capturedAt: hours ? new Date(instant).toISOString() : undefined };
}

function photoExif(tags) {
    const { ExposureTime, FNumber, ISO, FocalLength } = tags;
    const make = typeof tags.Make === 'string' ? tags.Make.trim() : '';
    const model = typeof tags.Model === 'string' ? tags.Model.trim() : '';
    const lens = typeof tags.LensModel === 'string' ? tags.LensModel.trim() : '';
    const camera = make && model && !model.toLowerCase().startsWith(make.toLowerCase())
        ? `${make} ${model}` : model || make;
    const exif = {};
    if (Number.isFinite(ExposureTime) && ExposureTime > 0) {
        const denominator = Math.round(1 / ExposureTime);
        exif.shutterSpeed = ExposureTime <= 0.5 && Math.abs(ExposureTime * denominator - 1) < 0.01
            ? `1/${denominator} s` : `${ExposureTime} s`;
    }
    if (Number.isFinite(FNumber) && FNumber > 0) exif.aperture = `ƒ/${FNumber}`;
    if (Number.isFinite(ISO) && ISO > 0) exif.iso = ISO;
    if (Number.isFinite(FocalLength) && FocalLength > 0) exif.focalLength = `${FocalLength} mm`;
    if (camera) exif.camera = camera;
    if (lens) exif.lens = lens;
    return exif;
}

function normalizePlace(value, field) {
    if (value != null && typeof value !== 'string' && (typeof value !== 'object' || Array.isArray(value))) {
        throw new Error('Invalid ' + field);
    }
    return Object.fromEntries(Object.entries(unknownPlace).map(([lang, fallback]) => {
        const text = typeof value === 'string' ? value : value?.[lang];
        if (text != null && typeof text !== 'string') throw new Error('Invalid ' + field + '.' + lang);
        const name = text?.trim();
        return [lang, name && !unknownValues.has(name) ? name : fallback];
    }));
}

function normalizePrefectureID(value, prefecture) {
    if (value != null && typeof value !== 'string') throw new Error('Invalid prefectureID');
    const code = value?.trim().toLowerCase();
    if (code && code !== 'unknown') {
        if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(code)) throw new Error('Invalid prefectureID');
        return code;
    }
    return unknownValues.has(prefecture.en) ? 'unknown' : slug(prefecture.en);
}

async function readAnnotations(catalogFile) {
    try {
        return await readFile(catalogFile, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return '';
    }
}

export async function readPhotoCatalog(projectDir = root) {
    const originals = path.join(projectDir, 'pic');
    const catalogFile = path.join(projectDir, 'annotations.json');
    const source = await readAnnotations(catalogFile);
    const annotations = JSON.parse(source.trim() || '{}') ?? {};
    if (typeof annotations !== 'object' || Array.isArray(annotations)) {
        throw new Error('annotations.json must contain an object keyed by source filename.');
    }
    const files = new Set(await imageFiles(originals));
    const legacyNames = new Map();
    for (const file of files) {
        const stem = file.slice(0, -path.extname(file).length);
        if (!Object.hasOwn(annotations, stem) || isPhotoPath(stem)) continue;
        if (Object.hasOwn(annotations, file) || legacyNames.has(stem)) {
            throw new Error(file + ': 照片註記重複，請保留包含副檔名的鍵。');
        }
        legacyNames.set(stem, file);
    }
    const entries = new Map();
    for (const [key, entry] of Object.entries(annotations)) {
        const file = legacyNames.get(key) ?? key;
        entries.set(file, entry);
    }
    const matched = [...new Set([...files, ...entries.keys()])].sort().map(file => {
        if (!isPhotoPath(file)) throw new Error(file + ': 請使用 pic/ 下包含副檔名的相對路徑。');
        const entry = entries.get(file);
        if (entry != null && entry !== '' && (typeof entry !== 'object' || Array.isArray(entry))) {
            throw new Error(file + ': 照片註記必須是 JSON 物件。');
        }
        const prefecture = normalizePlace(entry?.prefecture, 'prefecture');
        const annotation = {
            prefectureID: normalizePrefectureID(entry?.prefectureID ?? entry?.prefectureId, prefecture),
            prefecture,
            city: normalizePlace(entry?.city, 'city'),
            location: normalizePlace(entry?.location, 'location'),
        };
        const sha256 = entry?.originalSha256;
        if (sha256 !== undefined && !isOriginalHash(sha256)) {
            throw new Error(file + ': 無效的 originalSha256。');
        }
        if (entry?.deleted !== undefined && typeof entry.deleted !== 'boolean') throw new Error(file + ': 無效的 deleted。');
        const r2Deletion = entry?.r2Deletion;
        if (r2Deletion !== undefined && r2Deletion !== 'shared' && r2Deletion !== 'complete') {
            throw new Error(file + ': 無效的 r2Deletion。');
        }
        const deleted = entry?.deleted === true;
        return { file, annotation, sha256, deleted, r2Deletion: deleted ? r2Deletion : undefined,
            present: files.has(file), annotated: entries.has(file) };
    });
    return { originals, catalogFile, source, matched };
}

export async function savePhotoCatalog(catalog) {
    const { catalogFile, source, matched } = catalog;
    const stored = matched.filter(entry => entry.annotated || entry.sha256 || entry.deleted);
    const updated = JSON.stringify(Object.fromEntries(stored.map(({ file, annotation, sha256, deleted, r2Deletion }) =>
        [file, { ...annotation, originalSha256: sha256, deleted: deleted || undefined,
            r2Deletion }]
    )), null, 2) + '\n';
    if (updated !== source) {
        const temporary = catalogFile + '.' + randomUUID() + '.tmp';
        try {
            await writeFile(temporary, updated);
            await assertCurrentPhotoCatalog(catalog);
            await rename(temporary, catalogFile);
            catalog.source = updated;
        } finally {
            await rm(temporary, { force: true });
        }
    }
}

export async function assertCurrentPhotoCatalog({ catalogFile, source }) {
    if (await readAnnotations(catalogFile) !== source) {
        throw new Error('同步期間 annotations.json 已變更，請重新執行同步。');
    }
}

export function reportPendingAnnotations(matched) {
    const pending = [];
    for (const { file, annotation } of matched) {
        const incomplete = [];
        if (annotation.prefectureID === 'unknown') incomplete.push('prefectureID');
        for (const field of placeFields) {
            if (Object.values(annotation[field]).some(value => unknownValues.has(value))) incomplete.push(field);
        }
        if (incomplete.length) pending.push(file + ' · ' + incomplete.join(', '));
    }
    if (pending.length) console.warn('請在 annotations.json 補寫以下照片的地點欄位\n' + pending.map(file => '- ' + file).join('\n'));
}

async function writeWebP(buffer, width, previous, target) {
    try {
        await copyFile(previous, target);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        // Sharp auto-orients pixels and strips all input metadata by default.
        await sharp(buffer).autoOrient().resize({ width, withoutEnlargement: true })
            .webp({ quality }).toFile(target);
    }
}

async function processPhoto({ file, annotation, sha256 }, paths) {
    const buffer = await readLocalOriginal(paths.originals, file);
    const hash = originalHash(buffer);
    if (sha256 && sha256 !== hash) throw new Error('本機原圖版本不同，請執行 npm run photos:sync。');
    const image = await sharp(buffer).metadata();
    // Read the embedded TIFF block regardless of the image container.
    const sourceExif = image.exif;
    const tiff = sourceExif?.toString('ascii', 0, 6) === 'Exif\0\0' ? sourceExif.subarray(6) : sourceExif;
    const tags = tiff ? await exifr.parse(tiff, { pick: exifFields, gps: false, reviveValues: false }) ?? {} : {};
    const { width, height } = image.autoOrient;
    const capture = captureTime(tags.DateTimeOriginal, tags.OffsetTimeOriginal);
    const largest = Math.max(1, Math.round(width * Math.min(1, maximumEdge / Math.max(width, height))));
    const widths = [...thumbnailWidths.filter(w => w < largest), largest];
    const digest = createHash('sha256').update(recipe).update(buffer).digest('hex').slice(0, 16);
    const basename = slug(file.slice(0, -path.extname(file).length));
    const variants = [];
    for (const w of widths) {
        const filename = basename + '.' + digest + '.' + w + '.webp';
        await writeWebP(buffer, w, path.join(paths.previousGallery, filename), path.join(paths.gallery, filename));
        variants.push({ src: 'gallery/' + filename, width: w });
    }

    const original = {
        url: originalUrl(hash, file),
        name: path.basename(file),
    };
    const photo = { ...annotation, width, height, date: capture?.date ?? null, capturedAt: capture?.capturedAt,
        exif: photoExif(tags),
        thumbnail: variants[0].src, src: variants.at(-1).src, variants, original };
    return { file, photo, instant: capture?.instant ?? -Infinity };
}

export async function buildPhotos(outputDir, projectDir = root, { requireSynced = false } = {}) {
    const { originals, matched } = await readPhotoCatalog(projectDir);
    const active = matched.filter(entry => !entry.deleted);
    const missing = active.filter(entry => !entry.present).map(entry => entry.file);
    if (missing.length) throw new Error(`缺少本機原圖，請執行 npm run photos:sync。\n${missing.join('\n')}`);
    if (requireSynced && active.some(entry => !entry.sha256)) {
        throw new Error('仍有原圖尚未同步至 R2，請重新執行 npm run deploy。');
    }
    const paths = {
        originals,
        previousGallery: path.join(projectDir, 'dist', 'gallery'),
        gallery: path.join(outputDir, 'gallery')
    };
    const records = [];
    await mkdir(paths.gallery, { recursive: true });
    for (const entry of active) {
        try {
            records.push(await processPhoto(entry, paths));
        } catch (error) {
            throw new Error(entry.file + ': ' + error.message, { cause: error });
        }
    }
    reportPendingAnnotations(active);
    records.sort((a, b) => b.instant - a.instant || a.file.localeCompare(b.file, 'en'));
    return records.map(record => record.photo);
}
