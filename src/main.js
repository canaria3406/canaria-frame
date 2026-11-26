const dictionaries = {
    'zh-Hant': {
        missingTitle: '找不到頁面｜かなりあのピクセル', missingHeading: '找不到頁面或照片',
        missingMessage: '這個連結可能有誤，或是照片已經移除。', backToArchive: '返回相簿',
        timeline: '時間軸', places: '地點',
        nav: '主要導覽', skip: '跳至照片',
        footerHome: '首頁', footerNav: '頁尾導覽',
        backToTop: '回頁首', layout: '照片排列', masonry: '瀑布流', grid: '網格',
        viewer: '照片檢視器', prev: '上一張', next: '下一張', close: '關閉', info: '照片資訊',
        download: '下載原圖', downloadFailed: '無法下載原圖，請稍後再試。', imagePending: '正在載入照片…', imageFailed: '無法載入照片。',
        prefecture: '都道府縣', city: '城市', location: '地點',
        capturedAt: '拍攝時間', camera: '相機', lens: '鏡頭', shutterSpeed: '快門',
        aperture: '光圈', iso: 'ISO', focalLength: '焦距',
        allPlaces: '所有地點', unknownPlace: '未知', unknownDate: '日期未知',
        empty: '目前沒有照片。', photoCount: n => n + ' 張照片', placeCount: n => n + ' 個地點',
        photoName: filename => '照片 ' + filename,
    },
    ja: {
        missingTitle: 'ページが見つかりません｜かなりあのピクセル', missingHeading: 'ページまたは写真が見つかりません',
        missingMessage: 'リンクに誤りがあるか、写真が削除された可能性があります。', backToArchive: 'アルバムに戻る',
        timeline: 'タイムライン', places: '場所',
        nav: 'メインナビゲーション', skip: '写真へ移動',
        footerHome: 'ホーム', footerNav: 'フッターナビゲーション',
        backToTop: 'ページの先頭へ', layout: '写真の配置', masonry: 'メイソンリー', grid: 'グリッド',
        viewer: 'フォトビューアー', prev: '前の写真', next: '次の写真', close: '閉じる', info: '写真情報',
        download: '元の写真をダウンロード', downloadFailed: '元の写真をダウンロードできません。しばらくしてから再試行してください。', imagePending: '写真を読み込み中…', imageFailed: '写真を読み込めませんでした。',
        prefecture: '都道府県', city: '市区町村', location: '撮影場所',
        capturedAt: '撮影日時', camera: 'カメラ', lens: 'レンズ', shutterSpeed: 'シャッター速度',
        aperture: '絞り', iso: 'ISO', focalLength: '焦点距離',
        allPlaces: 'すべての場所', unknownPlace: '不明', unknownDate: '撮影日不明',
        empty: '写真はまだありません。', photoCount: n => '写真 ' + n + ' 枚', placeCount: n => n + ' 地点',
        photoName: filename => '写真 ' + filename,
    },
    en: {
        missingTitle: 'Page not found | かなりあのピクセル', missingHeading: 'Page or photo not found',
        missingMessage: 'The link may be incorrect, or the photo may have been removed.', backToArchive: 'Back to the gallery',
        timeline: 'Timeline', places: 'Places',
        nav: 'Main navigation', skip: 'Skip to photos',
        footerHome: 'Home', footerNav: 'Footer navigation',
        backToTop: 'Back to top', layout: 'Gallery layout', masonry: 'Masonry', grid: 'Grid',
        viewer: 'Photo viewer', prev: 'Previous photo', next: 'Next photo', close: 'Close', info: 'Photo information',
        download: 'Download original', downloadFailed: 'Could not download the original. Try again later.', imagePending: 'Loading photo…', imageFailed: 'Could not load photo.',
        prefecture: 'Prefecture', city: 'City', location: 'Location',
        capturedAt: 'Captured', camera: 'Camera', lens: 'Lens', shutterSpeed: 'Shutter speed',
        aperture: 'Aperture', iso: 'ISO', focalLength: 'Focal length',
        allPlaces: 'All places', unknownPlace: 'Unknown', unknownDate: 'Unknown date',
        empty: 'No photos yet.', photoCount: n => n + (n === 1 ? ' photo' : ' photos'),
        placeCount: n => n + (n === 1 ? ' place' : ' places'), photoName: filename => 'Photo ' + filename,
    },
};

export function translate(lang, key, ...args) {
    const entry = (dictionaries[lang] ?? dictionaries['zh-Hant'])[key];
    return typeof entry === 'function' ? entry(...args) : entry;
}

function localize(value, lang) {
    if (value && typeof value === 'object') {
        return value[lang] || value['zh-Hant'] || value.ja || value.en || '';
    }
    return value == null ? '' : String(value);
}

const symbols = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',
    pin: '<path d="M19.5 10c0 5.5-7.5 11.5-7.5 11.5S4.5 15.5 4.5 10a7.5 7.5 0 1 1 15 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    prev: '<path d="m15 5-7 7 7 7"/>', next: '<path d="m9 5 7 7-7 7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v.2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
};

function icon(name) {
    return `<svg class="${name}-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => entities[ch]);
const unknownPlaces = new Set(Object.values(dictionaries).map(dictionary => dictionary.unknownPlace.toLowerCase()));
const placeKey = photo => photo.prefectureID === 'unknown' ? '~' : photo.prefectureID;
function placeName(key, group, lang) {
    if (key === '~') return translate(lang, 'unknownPlace');
    return group.map(photo => knownPlace(photo.prefecture, lang)).find(Boolean) || translate(lang, 'unknownPlace');
}
const thumbnailSizes = '(max-width: 680px) calc(100vw - 32px), (min-width: 980px) min(calc((100vw - 62px) / 3), 386px), calc((100vw - 50px) / 2)';
const eagerPhotoCount = 3;

function knownPlace(value, lang) {
    return [value?.[lang], ...Object.values(value ?? {})].find(text => text && !unknownPlaces.has(text.toLowerCase()));
}

function groupBy(items, getKey) {
    const groups = new Map();
    for (const item of items) {
        const key = getKey(item);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    }
    return groups;
}

// Calendar groups use the Japan-local date supplied by the build, independent of the viewer's timezone.
const formats = new Map();
function dateLabel(date, lang, kind) {
    if (!date) return translate(lang, 'unknownDate');
    const key = lang + '/' + kind;
    if (!formats.has(key)) {
        const options = { year: 'numeric', month: 'long', timeZone: 'UTC' };
        if (kind !== 'month') options.day = 'numeric';
        formats.set(key, new Intl.DateTimeFormat(lang, options));
    }
    return formats.get(key).format(new Date(date + 'T12:00:00Z'));
}

function photoCaption(photo, lang) {
    const date = dateLabel(photo.date, lang, 'day');
    const location = knownPlace(photo.location, lang) || knownPlace(photo.city, lang)
        || knownPlace(photo.prefecture, lang) || translate(lang, 'unknownPlace');
    return `${date} · ${location}`;
}

function captureLabel(photo, lang) {
    if (!photo.capturedAt) return photo.date ? dateLabel(photo.date, lang, 'day') : '';
    const key = lang + '/capture';
    if (!formats.has(key)) {
        formats.set(key, new Intl.DateTimeFormat(lang, {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            second: '2-digit', timeZone: 'Asia/Tokyo',
        }));
    }
    return formats.get(key).format(new Date(photo.capturedAt));
}

function imageTag(photo, index) {
    const variants = (photo.variants || []).filter(variant => variant.width <= 1440);
    const srcset = variants.map(variant => escapeHtml(variant.src) + ' ' + Number(variant.width) + 'w').join(', ');
    const priority = index === 0 ? 'fetchpriority="high"' : '';
    return `<img width="${Number(photo.width)}" height="${Number(photo.height)}" alt="" loading="${index < eagerPhotoCount ? 'eager' : 'lazy'}" decoding="async" ${priority}
        ${srcset ? `srcset="${srcset}" sizes="${thumbnailSizes}"` : ''} src="${escapeHtml(photo.thumbnail)}">`;
}

function photoGrid(photos, lang, offset = 0) {
    const tiles = photos.map((photo, i) => {
        const index = offset + i;
        const caption = photoCaption(photo, lang);
        const name = `${translate(lang, 'photoName', photo.original.name)} · ${caption}`;
        const reveal = index < eagerPhotoCount ? '' : ' data-reveal';
        return `<a class="photo-tile" data-photo="${escapeHtml(photo.original.url)}" href="${escapeHtml(photo.src)}" aria-label="${escapeHtml(name)}"${reveal}>
            ${imageTag(photo, index)}
            <span class="photo-caption" aria-hidden="true">${escapeHtml(caption)}</span>
        </a>`;
    });
    return `<div class="photo-grid" data-arrangement="grid">${tiles.join('')}</div>`;
}

// Shared by the static page builder and view changes, so first paint and enhanced markup match.
export function renderArchive(photos, { mode = 'timeline', place = null, lang = 'zh-Hant' } = {}) {
    const t = (key, ...args) => translate(lang, key, ...args);
    if (!photos.length) return `<p class="archive-empty">${t('empty')}</p>`;
    if (mode === 'places') {
        const places = groupBy(photos, placeKey);
        const selected = places.get(place);
        if (selected) {
            return `<nav class="place-crumb" aria-label="${t('places')}"><a href="#places">${t('allPlaces')}</a><span aria-hidden="true">/</span><h2>${escapeHtml(placeName(place, selected, lang))}</h2></nav>${photoGrid(selected, lang)}`;
        }
        const covers = [...places.entries()].map(([key, group], i) => {
            const cover = group.find(photo => photo.width >= photo.height) ?? group[0];
            return `<a class="place-card" href="#places/${encodeURIComponent(key)}" data-reveal>${imageTag(cover, i)}
                <span class="place-label"><strong>${escapeHtml(placeName(key, group, lang))}</strong><small>${t('photoCount', group.length)}</small></span>
            </a>`;
        });
        return `<div class="places-grid">${covers.join('')}</div>`;
    }
    let offset = 0;
    const months = groupBy(photos, photo => photo.date?.slice(0, 7) ?? '');
    return [...months.values()].map(group => {
        const date = dateLabel(group[0].date, lang, 'month');
        const locations = [...new Set(group.map(photo => knownPlace(photo.prefecture, lang)).filter(Boolean))];
        const locationTag = locations.length ? `<span class="group-location" title="${escapeHtml(locations.join(' · '))}">${icon('pin')}${escapeHtml(locations.slice(0, 2).join(' · '))}</span>` : '';
        const groupCount = months.size > 1 ? `<span class="group-count">${t('photoCount', group.length)}</span>` : '';
        const heading = `<header class="month-head"${offset > 0 ? ' data-reveal' : ''}>${icon('calendar')}<h2>${escapeHtml(date)}</h2>
            ${locationTag}<span class="group-line" aria-hidden="true"></span>${groupCount}</header>`;
        const result = `<section class="month-group">${heading}${photoGrid(group, lang, offset)}</section>`;
        offset += group.length;
        return result;
    }).join('');
}

function createGalleryLayout() {
    let layout = 'grid';
    let grids = [];
    let frame;
    const lastGeometry = new WeakMap();
    const observer = window.ResizeObserver && new ResizeObserver(schedule);
    // Geometry is computed from exported dimensions before image decoding. Always take the
    // leftmost shortest column to keep visual top-to-bottom/left-to-right order equal to DOM order.
    function arrange() {
        for (const grid of grids) {
            grid.dataset.arrangement = layout;
            if (layout === 'grid') {
                if (!grid.classList.contains('is-positioned')) continue;
                grid.classList.remove('is-positioned');
                lastGeometry.delete(grid);
                grid.style.removeProperty('height');
                for (const tile of grid.children) {
                    for (const prop of ['left', 'top', 'width', 'height']) tile.style.removeProperty(prop);
                }
                continue;
            }
            const style = getComputedStyle(grid);
            const columns = Math.max(1, parseInt(style.getPropertyValue('--columns'), 10) || 3);
            const gap = parseFloat(style.columnGap) || 0;
            const width = (grid.getBoundingClientRect().width - (columns - 1) * gap) / columns;
            if (width <= 0) continue;
            const previous = lastGeometry.get(grid);
            if (previous && previous.width === width && previous.columns === columns && previous.gap === gap) continue;
            lastGeometry.set(grid, { width, columns, gap });
            const heights = Array(columns).fill(0);
            for (const tile of grid.children) {
                const img = tile.querySelector('img');
                const height = width * Number(img.getAttribute('height')) / Number(img.getAttribute('width'));
                const column = heights.indexOf(Math.min(...heights));
                Object.assign(tile.style, {
                    left: (width + gap) * column + 'px', top: heights[column] + 'px',
                    width: width + 'px', height: height + 'px',
                });
                heights[column] += height + gap;
            }
            grid.classList.add('is-positioned');
            grid.style.height = Math.max(0, Math.max(...heights) - gap) + 'px';
        }
    }
    function schedule() {
        if (frame === undefined) frame = requestAnimationFrame(() => {
            frame = undefined;
            arrange();
        });
    }
    window.addEventListener('resize', schedule, { passive: true });
    return {
        attach(archive) {
            observer?.disconnect();
            grids = [...archive.querySelectorAll('.photo-grid')];
            for (const grid of grids) observer?.observe(grid);
            arrange();
        },
        set(next) {
            layout = next;
            document.querySelectorAll('button[data-layout]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
            });
            arrange();
        },
    };
}

function createViewer(getLang) {
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') return null;
    dialog.className = 'lightbox';
    const button = (key, attributes = '') =>
        `<button type="button" class="icon-button lightbox-${key}" data-action="${key}" ${attributes}>${icon(key)}</button>`;
    dialog.innerHTML = `<div class="lightbox-shell" tabindex="-1">
        <header class="lightbox-bar"><span class="lightbox-counter" aria-live="polite" aria-atomic="true"></span>
            <div class="lightbox-actions">${button('download')}
            ${button('info', 'aria-controls="lightbox-details" aria-expanded="false"')}
            ${button('close')}</div></header>
        <p class="lightbox-status" role="status"></p>
        <div class="lightbox-content">
            <div class="lightbox-media">
                ${button('prev')}
                <div class="lightbox-stage"></div>
                ${button('next')}
                <p class="lightbox-caption"></p>
            </div>
            <aside class="lightbox-details" id="lightbox-details" tabindex="0" hidden>
                <dl></dl>
            </aside>
        </div></div>`;
    document.body.append(dialog);
    const stage = dialog.querySelector('.lightbox-stage');
    let image;
    let imageStatus;
    let loadingTimer;
    let downloadCheck;
    let downloadFailed = false;
    const details = dialog.querySelector('.lightbox-details');
    const properties = details.querySelector('dl');
    const infoButton = dialog.querySelector('[data-action="info"]');
    const downloadButton = dialog.querySelector('[data-action="download"]');
    const status = dialog.querySelector('.lightbox-status');
    let sequence = [];
    let index = 0;
    let opener;
    let scroll;
    let touch;

    function renderDetails(photo, lang) {
        const { shutterSpeed, aperture, iso, focalLength, camera, lens } = photo.exif ?? {};
        const fields = {
            shutterSpeed, aperture, iso, focalLength,
            camera, lens, capturedAt: captureLabel(photo, lang),
            prefecture: localize(photo.prefecture, lang), city: localize(photo.city, lang),
            location: localize(photo.location, lang),
        };
        properties.replaceChildren();
        for (const [key, value] of Object.entries(fields)) {
            const field = document.createElement('div');
            const term = document.createElement('dt');
            const detail = document.createElement('dd');
            term.textContent = translate(lang, key);
            detail.textContent = value == null || value === '' ? '-' : value;
            field.append(term, detail);
            properties.append(field);
        }
    }

    function updateStatus() {
        const key = downloadFailed ? 'downloadFailed' : imageStatus;
        const message = key ? translate(getLang(), key) : '';
        if (status.textContent !== message) status.textContent = message;
    }

    async function downloadOriginal() {
        if (downloadCheck) return;
        const { url, name } = sequence[index].original;
        const check = new AbortController();
        downloadCheck = check;
        downloadButton.setAttribute('aria-disabled', 'true');
        downloadFailed = false;
        updateStatus();
        try {
            const response = await fetch(url, { method: 'HEAD', signal: check.signal });
            if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
                throw new Error('Original unavailable');
            }
            if (check.signal.aborted) return;
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            link.click();
        } catch {
            if (!check.signal.aborted) {
                downloadFailed = true;
                updateStatus();
            }
        } finally {
            if (downloadCheck === check) {
                downloadCheck = null;
                downloadButton.removeAttribute('aria-disabled');
            }
        }
    }

    function resetStatus() {
        clearTimeout(loadingTimer);
        downloadCheck?.abort();
        downloadCheck = null;
        downloadButton.removeAttribute('aria-disabled');
        downloadFailed = false;
        imageStatus = null;
    }

    function render() {
        const photo = sequence[index];
        const lang = getLang();
        for (const node of dialog.querySelectorAll('[data-action]')) {
            const key = node.dataset.action;
            const label = translate(lang, key);
            node.setAttribute('aria-label', label);
            node.title = label;
            if (key === 'prev' || key === 'next') node.disabled = sequence.length < 2;
        }
        dialog.setAttribute('aria-label', translate(lang, 'viewer'));
        details.setAttribute('aria-label', translate(lang, 'info'));
        dialog.querySelector('.lightbox-counter').textContent = `${index + 1} / ${sequence.length}`;
        dialog.querySelector('.lightbox-caption').textContent = photoCaption(photo, lang);
        if (image?.getAttribute('src') !== photo.src) {
            const next = document.createElement('img');
            next.className = 'lightbox-image';
            next.alt = '';
            next.decoding = 'async';
            next.width = photo.width;
            next.height = photo.height;
            const settle = key => {
                if (image !== next) return;
                clearTimeout(loadingTimer);
                imageStatus = key;
                updateStatus();
            };
            next.onload = () => settle(null);
            next.onerror = () => settle('imageFailed');
            loadingTimer = setTimeout(() => settle('imagePending'), 500);
            image = next;
            stage.replaceChildren(image);
            image.sizes = '100vw';
            image.srcset = (photo.variants || []).map(variant => variant.src + ' ' + variant.width + 'w').join(', ');
            image.src = photo.src;
        }
        updateStatus();
        renderDetails(photo, lang);
    }
    function step(direction) {
        if (sequence.length < 2) return;
        resetStatus();
        index = (index + direction + sequence.length) % sequence.length;
        render();
        details.scrollTop = 0;
    }
    dialog.addEventListener('click', event => {
        const action = event.target.closest('button')?.dataset.action;
        if (event.target === dialog || action === 'close') dialog.close();
        if (action === 'download') void downloadOriginal();
        if (action === 'prev') step(-1);
        if (action === 'next') step(1);
        if (action === 'info') {
            details.hidden = !details.hidden;
            infoButton.setAttribute('aria-expanded', String(!details.hidden));
            if (!details.hidden) details.scrollTop = 0;
        }
    });
    dialog.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            step(event.key === 'ArrowRight' ? 1 : -1);
        }
    });
    stage.addEventListener('touchstart', event => {
        touch = event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    stage.addEventListener('touchend', event => {
        if (!touch) return;
        const dx = event.changedTouches[0].clientX - touch.x;
        const dy = event.changedTouches[0].clientY - touch.y;
        touch = null;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    stage.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
    dialog.addEventListener('close', () => {
        document.body.classList.remove('lightbox-open');
        opener?.focus({ preventScroll: true });
        if (scroll) window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
        resetStatus();
        sequence = [];
        image = null;
        stage.replaceChildren();
    });
    return {
        open(link, photos, touchOpened) {
            const selected = photos.findIndex(photo => photo.original.url === link.dataset.photo);
            if (selected === -1) return false;
            index = selected;
            sequence = photos;
            opener = touchOpened ? null : link;
            if (touchOpened && document.activeElement?.closest('.photo-tile')) document.activeElement.blur();
            scroll = { x: window.scrollX, y: window.scrollY };
            details.hidden = true;
            infoButton.setAttribute('aria-expanded', 'false');
            render();
            document.body.classList.add('lightbox-open');
            const initialFocus = dialog.querySelector(touchOpened ? '.lightbox-shell' : '[data-action="close"]');
            initialFocus.setAttribute('autofocus', '');
            dialog.showModal();
            initialFocus.removeAttribute('autofocus');
            return true;
        },
        refresh() { if (dialog.open) render(); },
        close() { if (dialog.open) dialog.close(); },
    };
}

function readRoute() {
    const [view, key] = location.hash.slice(1).split('/');
    if (view === 'places') {
        let place = null;
        try { place = key ? decodeURIComponent(key) : null; } catch { /* Use the places index for malformed links. */ }
        return { mode: 'places', place };
    }
    if (view && view !== 'timeline' && history.state?.frameView) return history.state.frameView;
    return { mode: 'timeline', place: null };
}

function startArchive() {
    window.Canaria?.i18n.define(dictionaries);
    const archive = document.getElementById('archive');
    const data = document.getElementById('photo-data');
    if (!archive || !data) return;
    const photos = JSON.parse(data.textContent);
    const places = groupBy(photos, placeKey);
    const getLang = () => window.Canaria?.i18n.lang || document.documentElement.lang || 'zh-Hant';
    const gallery = createGalleryLayout();
    const viewer = createViewer(getLang);
    let route = readRoute();
    let visiblePhotos = photos;
    const primary = document.getElementById('view-heading');

    function update({ keepMarkup = false, moveFocus = false } = {}) {
        const lang = getLang();
        if (route.place && !places.has(route.place)) route.place = null;
        const isIndex = route.mode === 'places' && !route.place;
        visiblePhotos = places.get(route.place) || photos;
        if (!keepMarkup) {
            archive.innerHTML = renderArchive(photos, { ...route, lang });
            archive.querySelectorAll('[data-reveal]').forEach(el => window.Canaria?.reveal(el));
        }
        if (primary) primary.textContent = translate(lang, route.mode);
        const count = document.querySelector('[data-archive-count]');
        if (count) count.textContent = isIndex ? translate(lang, 'placeCount', places.size) : translate(lang, 'photoCount', visiblePhotos.length);
        document.querySelectorAll('[data-view]').forEach(link => {
            if (link.dataset.view === route.mode) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        for (const button of document.querySelectorAll('button[data-layout]')) {
            button.disabled = isIndex || !visiblePhotos.length;
        }
        gallery.attach(archive);
        viewer?.refresh();
        const focusTarget = route.place ? archive.querySelector('.place-crumb h2') : primary;
        if (moveFocus && focusTarget) {
            focusTarget.tabIndex = -1;
            focusTarget.focus({ preventScroll: true });
            focusTarget.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
    }

    const savedLayout = window.Canaria?.storage.get('frame-layout');
    gallery.set(savedLayout === 'masonry' ? 'masonry' : 'grid');
    const defaultLang = document.documentElement.dataset.langs?.split(/\s+/)[0] || 'zh-Hant';
    update({ keepMarkup: route.mode === 'timeline' && getLang() === defaultLang });

    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a');
        const touchOpened = event.pointerType === 'touch'
            || (!event.pointerType && event.detail > 0 && matchMedia('(hover: none)').matches);
        if (link?.dataset.photo && viewer?.open(link, visiblePhotos, touchOpened)) {
            event.preventDefault();
            return;
        }
        const target = link?.getAttribute('href');
        if (target === '#timeline' || target === '#places' || target?.startsWith('#places/')) {
            event.preventDefault();
            if (location.hash !== target) history.pushState(null, '', target);
            route = readRoute();
            update({ moveFocus: true });
            return;
        }
        const layout = event.target.closest('button[data-layout]')?.dataset.layout;
        if (layout === 'masonry' || layout === 'grid') {
            gallery.set(layout);
            window.Canaria?.storage.set('frame-layout', layout);
        }
    });
    window.addEventListener('hashchange', () => {
        if (location.hash && !/^#(?:timeline$|places(?:\/|$))/.test(location.hash)) {
            // A skip link or back-to-top link stays in the same archive view, including on Back.
            const saved = history.state?.frameView;
            if (!saved) history.replaceState({ ...history.state, frameView: route }, '');
            else if (saved.mode !== route.mode || saved.place !== route.place) {
                route = saved;
                update();
            }
            return;
        }
        route = readRoute();
        viewer?.close();
        update({ moveFocus: true });
    });
    document.addEventListener('canaria:langchange', event => {
        if (!event.detail.initial && event.detail.scope === 'page') update();
    });
}

if (typeof document !== 'undefined') startArchive();
