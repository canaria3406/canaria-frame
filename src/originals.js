const imageTypes = new Map([
    ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'],
    ['webp', 'image/webp'], ['avif', 'image/avif'], ['tif', 'image/tiff'], ['tiff', 'image/tiff'],
]);

export const originalsManifestPath = '/originals.json';

export function imageType(file) {
    const extension = /\.([a-z]+)$/i.exec(file)?.[1];
    return imageTypes.get(extension?.toLowerCase());
}

export function isPhotoPath(file) {
    return file.split('/').every(part => part && !part.startsWith('.') && !/[\\:<>"|?*\x00-\x1f]/.test(part)
        && !/[. ]$/.test(part)) && Boolean(imageType(file));
}

export function isOriginalHash(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export function originalKey(hash) {
    return `originals/${hash}`;
}

export function originalUrl(hash, file) {
    return `/${originalKey(hash)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

export function parseOriginalPath(pathname) {
    const [, prefix, hash, ...segments] = pathname.split('/');
    if (prefix !== 'originals' || !isOriginalHash(hash)) return null;
    try {
        const parts = segments.map(decodeURIComponent);
        const file = parts.join('/');
        if (parts.some(part => part.includes('/')) || !isPhotoPath(file)) return null;
        return { hash, file };
    } catch {
        return null;
    }
}
