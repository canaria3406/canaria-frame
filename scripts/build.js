import { cp, lstat, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderArchive, translate } from '../src/main.js';
import { originalsManifestPath, parseOriginalPath } from '../src/originals.js';
import { buildPhotos } from './build-photos.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const lang = 'zh-Hant';

export async function buildHasDeletedPhotos(projectDir, deleted) {
    if (!deleted.size) return false;
    const output = path.join(projectDir, 'dist');
    try {
        if (!(await lstat(output)).isDirectory()) throw new Error('dist/ 必須是本機資料夾。');
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
    try {
        const urls = JSON.parse(await readFile(path.join(output, originalsManifestPath), 'utf8'));
        if (!urls || typeof urls !== 'object' || Array.isArray(urls)) return true;
        return Object.keys(urls).some(url => deleted.has(parseOriginalPath(url)?.file));
    } catch (error) {
        // Builds produced before the manifest cannot prove that the photo is absent.
        if (error.code === 'ENOENT' || error instanceof SyntaxError) return true;
        throw error;
    }
}

export async function discardBuild(projectDir) {
    const work = await mkdtemp(path.join(projectDir, '.frame-build-'));
    try {
        await rename(path.join(projectDir, 'dist'), path.join(work, 'dist'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    } finally {
        await rm(work, { recursive: true, force: true, maxRetries: 3 });
    }
}

export async function build({ requireSynced = false, projectDir = root } = {}) {
    const work = await mkdtemp(path.join(projectDir, '.frame-build-'));
    const site = path.join(work, 'site');
    const previous = path.join(work, 'previous');
    const output = path.join(projectDir, 'dist');
    let preserveBackup = false;
    try {
        const photos = await buildPhotos(site, projectDir, { requireSynced });
        await Promise.all([
            cp(path.join(projectDir, 'assets'), path.join(site, 'assets'), { recursive: true }),
            ...['main.css', 'main.js'].map(file => cp(path.join(projectDir, 'src', file), path.join(site, file))),
        ]);
        const source = file => readFile(path.join(projectDir, 'src', file), 'utf8');
        const [template, missingPage, header, footer] = await Promise.all(
            ['index.template.html', '404.html', 'header.html', 'footer.html'].map(source)
        );
        const slots = {
            header, footer,
            count: translate(lang, 'photoCount', photos.length),
            archive: renderArchive(photos, { lang }),
            'photo-data': JSON.stringify(photos).replaceAll('<', '\\u003c'),
        };
        const fillSlots = page => page.replace(/<!-- ([\w-]+) -->/g, (match, slot) => slots[slot] ?? match);
        await writeFile(path.join(site, 'index.html'), fillSlots(template));
        await writeFile(path.join(site, '404.html'), missingPage);
        const originals = Object.fromEntries(photos.map(photo => [photo.original.url, true]));
        await writeFile(path.join(site, originalsManifestPath), JSON.stringify(originals) + '\n');
        await writeFile(path.join(site, '_routes.json'), JSON.stringify({
            version: 1, include: ['/originals/*'], exclude: [],
        }) + '\n');

        // Replace the generated site as a unit so failed encodes leave the previous build available.
        try {
            await rename(output, previous);
            preserveBackup = true;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        try {
            await rename(site, output);
        } catch (error) {
            if (preserveBackup) {
                await rename(previous, output);
                preserveBackup = false;
            }
            throw error;
        }
        preserveBackup = false;
        console.log(`Built ${photos.length} photographs in dist/`);
    } finally {
        if (!preserveBackup) await rm(work, { recursive: true, force: true, maxRetries: 3 });
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
