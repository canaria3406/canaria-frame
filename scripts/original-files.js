import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function photoTarget(directory, file, create = false) {
    const parts = file.split('/');
    const name = parts.pop();
    for (const part of ['', ...parts]) {
        directory = path.join(directory, part);
        if (create) await mkdir(directory).catch(error => {
            if (error.code !== 'EEXIST') throw error;
        });
        if (!(await lstat(directory)).isDirectory()) throw new Error(`原圖目錄必須是本機資料夾：${directory}`);
    }
    return path.join(directory, name);
}

export async function readLocalOriginal(directory, file) {
    const target = await photoTarget(directory, file);
    if (!(await lstat(target)).isFile()) throw new Error('原圖必須是一般檔案。');
    return readFile(target);
}

export function originalHash(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
