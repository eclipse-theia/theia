// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/indent */

import { EOL } from 'os';
import { AbstractGenerator, GeneratorOptions } from './abstract-generator';
import { existsSync, readFileSync } from 'fs';
import * as fs from 'fs-extra';
import { BundlerGenerator } from './bundler-generator';

interface WebAppManifestIcon {
    readonly src: string;
    readonly sizes: string;
    readonly type?: string;
    readonly purpose?: string;
}

interface PwaShortcut {
    readonly name: string;
    readonly shortName?: string;
    readonly url: string;
    readonly description?: string;
    readonly icons?: readonly WebAppManifestIcon[];
}

interface AppleTouchIcon {
    readonly src: string;
    /** Optional `<link sizes="..."/>` value (e.g. `180x180`). iOS Safari uses this to pick the best icon. */
    readonly sizes?: string;
}

interface PwaManifestConfig {
    readonly name?: string;
    readonly shortName?: string;
    readonly description?: string;
    readonly id?: string;
    readonly lang?: string;
    readonly dir?: 'ltr' | 'rtl' | 'auto';
    readonly display?: string;
    readonly displayOverride?: readonly string[];
    readonly orientation?: string;
    readonly startUrl?: string;
    readonly scope?: string;
    readonly themeColor?: string;
    readonly backgroundColor?: string;
    readonly icons?: readonly WebAppManifestIcon[];
    /**
     * iOS Safari-specific icons emitted as `<link rel="apple-touch-icon" sizes="...">`. iOS does NOT
     * read the manifest icons reliably for the home-screen icon - the highest-priority cue is the
     * `apple-touch-icon` link. Provide 180x180 (iPhone) and optionally 167x167 (iPad Pro) entries.
     */
    readonly appleTouchIcons?: readonly AppleTouchIcon[];
    readonly shortcuts?: readonly PwaShortcut[];
    readonly categories?: readonly string[];
    readonly preferRelatedApplications?: boolean;
    /**
     * When `true` (default), a service worker is generated and registered so the app is
     * installable as a PWA (Chromium installability criteria require an active SW with a
     * `fetch` handler). Set to `false` to opt out (e.g. embedded contexts where SW scope
     * would conflict).
     */
    readonly serviceWorker?: boolean;
}

export class FrontendGenerator extends AbstractGenerator {

    /** Browser/OS chrome color when `prefers-color-scheme: dark` (VS Code editor background). */
    protected static readonly PWA_THEME_COLOR_DARK = '#1e1e1e';
    /** Browser/OS chrome color when `prefers-color-scheme: light`. */
    protected static readonly PWA_THEME_COLOR_LIGHT = '#ffffff';

    async generate(options?: GeneratorOptions): Promise<void> {
        await this.write(this.pck.frontend('index.html'), await this.compileIndexHtml(this.pck.targetFrontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(this.pck.targetFrontendModules, this.pck.targetFrontendPreloadModules));
        await this.write(this.pck.frontend('secondary-window.html'), this.compileSecondaryWindowHtml());
        await this.write(this.pck.frontend('secondary-index.js'), this.compileSecondaryIndexJs(this.pck.secondaryWindowModules));
        if (this.pck.isBrowser() || this.pck.isBrowserOnly()) {
            await this.write(this.pck.frontend('manifest.webmanifest'), this.compileWebAppManifest());
            if (this.isServiceWorkerEnabled()) {
                await this.write(this.pck.frontend('service-worker.js'), this.compileServiceWorker());
            } else {
                await this.removeGeneratedServiceWorker();
            }
        }
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('preload.js'), this.compilePreloadJs());
        }
    }

    protected compileIndexPreload(frontendModules: Map<string, string>): string {
        const template = this.pck.props.generator.config.preloadTemplate;
        if (!template) {
            return '';
        }

        // Support path to html file
        if (existsSync(template)) {
            return readFileSync(template).toString();
        }

        return template;
    }

    /** Qaap apps load bundle.js via qaap-login-gate.js (auth before IDE startup). */
    protected usesQaapLoginGate(): boolean {
        const deps = this.pck.pck.dependencies ?? {};
        return '@theia/qaap-product' in deps;
    }

    protected compileIndexScriptTag(): string {
        if (this.usesQaapLoginGate()) {
            return '<script type="text/javascript" src="./qaap-login-gate.js" charset="utf-8"></script>';
        }
        return '<script type="text/javascript" src="./bundle.js" charset="utf-8"></script>';
    }

    protected async compileIndexHtml(frontendModules: Map<string, string>): Promise<string> {
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const htmlSplashClass = appIcon ? ' class="theia-splash-branded"' : '';
        return `<!DOCTYPE html>
<html lang="en"${htmlSplashClass}>

<head>${await this.compileIndexHead(frontendModules)}
</head>

<body>
    <div class="theia-preload">${this.compileIndexPreload(frontendModules)}</div>
    ${this.compileIndexScriptTag()}
</body>

</html>`;
    }

    protected async compileIndexHead(frontendModules: Map<string, string>): Promise<string> {
        const preferEsbuild = await new BundlerGenerator(this.pck, this.options).preferESBuild();
        const appName = this.pck.props.frontend.config.applicationName;
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const isWebTarget = this.pck.isBrowser() || this.pck.isBrowserOnly();
        const appleTouchIconTags = this.compileAppleTouchIconLinks(appIcon);
        const pwaConfig = this.getPwaManifestConfig();
        const description = pwaConfig?.description?.trim();
        const appleTitle = pwaConfig?.shortName?.trim() || appName;
        const descriptionTag = description
            ? `\n  <meta name="description" content="${this.escapeHtmlAttribute(description)}">`
            : '';
        const iconLines = appIcon || appleTouchIconTags
            ? `
  ${appIcon ? `<meta name="application-icon" content="${this.escapeHtmlAttribute(appIcon)}">
  <link rel="icon" href="${this.escapeHtmlAttribute(appIcon)}">` : ''}${appleTouchIconTags}`
            : '';
        const splashBranding = appIcon ? this.compileSplashBrandingScript() : '';
        const pwaHead = isWebTarget ? this.compilePwaHeadFragment(appleTitle) : '';
        const swRegister = isWebTarget && this.isServiceWorkerEnabled() ? this.compileServiceWorkerRegistration() : '';
        return `
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">${descriptionTag}${pwaHead}
  <meta name="application-name" content="${this.escapeHtmlAttribute(appName)}">${iconLines}${splashBranding}${swRegister}
  ${preferEsbuild ? '<link rel="stylesheet" href="./bundle.css">' : ''}
  <title>${this.escapeHtmlAttribute(appName)}</title>`;
    }

    /**
     * Web App Manifest for installable PWA (browser targets only).
     *
     * Targets full Chromium installability:
     *  - `name`, `short_name`, `start_url`, `scope`, `display`, `theme_color`, `background_color`
     *  - icons of at least 192x192 and 512x512 px (the Chromium minimum)
     *  - explicit `id` (stable app identity across `start_url` changes)
     *  - explicit `prefer_related_applications: false`
     *  - separate `purpose: "any"` and `purpose: "maskable"` icon entries (auto-split from a combined
     *    `"any maskable"` purpose when consumer config doesn't separate them)
     */
    protected compileWebAppManifest(): string {
        const pwaConfig = this.getPwaManifestConfig();
        const appName = pwaConfig?.name ?? this.pck.props.frontend.config.applicationName;
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const shortName = pwaConfig?.shortName ?? (appName.length > 12 ? appName.slice(0, 12).trimEnd() : appName);
        const manifest: Record<string, unknown> = {
            id: pwaConfig?.id ?? pwaConfig?.startUrl ?? './',
            name: appName,
            short_name: shortName,
            lang: pwaConfig?.lang ?? 'en',
            dir: pwaConfig?.dir ?? 'auto',
            display: pwaConfig?.display ?? 'standalone',
            display_override: pwaConfig?.displayOverride
                ? [...pwaConfig.displayOverride]
                : ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'],
            start_url: pwaConfig?.startUrl ?? './',
            scope: pwaConfig?.scope ?? './',
            orientation: pwaConfig?.orientation ?? 'any',
            theme_color: pwaConfig?.themeColor ?? FrontendGenerator.PWA_THEME_COLOR_DARK,
            background_color: pwaConfig?.backgroundColor ?? FrontendGenerator.PWA_THEME_COLOR_DARK,
            prefer_related_applications: pwaConfig?.preferRelatedApplications ?? false
        };
        if (pwaConfig?.description?.trim()) {
            manifest.description = pwaConfig.description.trim();
        }
        if (pwaConfig?.categories?.length) {
            manifest.categories = [...pwaConfig.categories];
        }
        if (pwaConfig?.shortcuts?.length) {
            manifest.shortcuts = pwaConfig.shortcuts.map(s => ({
                name: s.name,
                ...(s.shortName ? { short_name: s.shortName } : {}),
                url: s.url,
                ...(s.description ? { description: s.description } : {}),
                ...(s.icons?.length ? { icons: s.icons } : {})
            }));
        }
        const icons = this.buildManifestIcons(pwaConfig?.icons, appIcon);
        if (icons.length) {
            manifest.icons = icons;
        }
        return JSON.stringify(manifest, undefined, 4) + '\n';
    }

    /**
     * Builds the manifest icon array, splitting combined `"any maskable"` purposes into separate
     * entries (Chrome and Lighthouse recommend declaring `any` and `maskable` independently so the
     * browser can pick the right asset for each surface).
     */
    protected buildManifestIcons(
        configured: readonly WebAppManifestIcon[] | undefined,
        appIcon: string | undefined
    ): WebAppManifestIcon[] {
        if (configured?.length) {
            const split: WebAppManifestIcon[] = [];
            for (const icon of configured) {
                const purposes = (icon.purpose ?? 'any').split(/\s+/).filter(Boolean);
                if (purposes.length > 1) {
                    for (const purpose of purposes) {
                        split.push({ ...icon, purpose });
                    }
                } else {
                    split.push(icon);
                }
            }
            return split;
        }
        if (!appIcon) {
            return [];
        }
        const mime = this.inferImageMimeType(appIcon);
        const base: WebAppManifestIcon = {
            src: appIcon,
            sizes: '192x192 512x512',
            ...(mime ? { type: mime } : {}),
            purpose: 'any'
        };
        return [base, { ...base, purpose: 'maskable' }];
    }

    protected getPwaManifestConfig(): PwaManifestConfig | undefined {
        return this.pck.props.frontend.config.pwa as PwaManifestConfig | undefined;
    }

    /**
     * PWA service worker generation. Off when `pwa.serviceWorker === false`, when
     * `QAAP_DISABLE_SERVICE_WORKER` is set, or by default for `mode: 'development'` builds
     * (local iteration — stale SW caches mask fresh `bundle.js`). Set
     * `QAAP_ENABLE_SERVICE_WORKER=1` to keep the SW in development builds.
     */
    protected isServiceWorkerEnabled(): boolean {
        if (this.getPwaManifestConfig()?.serviceWorker === false) {
            return false;
        }
        const disable = process.env.QAAP_DISABLE_SERVICE_WORKER?.trim();
        if (disable === '1' || disable === 'true') {
            return false;
        }
        if (this.options.mode === 'development') {
            const enable = process.env.QAAP_ENABLE_SERVICE_WORKER?.trim();
            return enable === '1' || enable === 'true';
        }
        return this.getPwaManifestConfig()?.serviceWorker !== false;
    }

    protected async removeGeneratedServiceWorker(): Promise<void> {
        const swPath = this.pck.frontend('service-worker.js');
        if (await fs.pathExists(swPath)) {
            await fs.remove(swPath);
        }
    }

    /**
     * Cache-busting version used in the SW cache keys.  We prefer the package version + a
     * `BUILD_VERSION` env var (set by CI) so each deployment invalidates the previous shell cache.
     * Development builds without `BUILD_VERSION` stamp a unique id on each generate so local
     * rebuilds evict `qaap-runtime-*` / `qaap-shell-*` caches even when the package version is unchanged.
     */
    protected resolveServiceWorkerVersion(): string {
        const pkgVersion = (this.pck.pck as { version?: string }).version ?? '0.0.0';
        const buildId = process.env.BUILD_VERSION?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim();
        if (buildId) {
            return `${pkgVersion}+${buildId}`;
        }
        if (this.options.mode === 'development') {
            return `${pkgVersion}+dev-${Date.now()}`;
        }
        return pkgVersion;
    }

    /**
     * Inline script registering the PWA service worker. Kept tiny and runs as early as possible so
     * the SW is active before user interaction (Chromium's installability heuristic prefers SWs
     * that activated quickly). The browser itself enforces secure-context requirements - we don't
     * second-guess it with a hostname check so that `http://` LAN previews still attempt registration
     * (the navigator will reject it cleanly and our `.catch` swallows the warning).
     */
    protected compileServiceWorkerRegistration(): string {
        const js = [
            '(function(){',
            'if(!(\'serviceWorker\' in navigator))return;',
            'var swUrl="./service-worker.js";',
            'var register=function(){',
            'navigator.serviceWorker.register(swUrl,{scope:"./"}).then(function(reg){',
            // Periodically poll for updates so long-lived IDE sessions pick up new builds.
            'try{setInterval(function(){reg.update().catch(function(){});},60*60*1000);}catch(_){}}',
            ').catch(function(err){console.warn("[pwa] service worker registration failed (likely insecure context)",err&&err.message||err);});',
            '};',
            // Register ASAP - waiting for `load` delays SW activation, which hurts Chromium's
            // "installability" heuristic (the install banner won't appear until the SW controls the page).
            'if(document.readyState!=="loading"){register();}else{document.addEventListener("DOMContentLoaded",register,{once:true});}',
            // Reload once when a new SW takes over so the page is consistent with cached assets.
            'var reloaded=false;',
            'navigator.serviceWorker.addEventListener("controllerchange",function(){',
            'if(reloaded)return;',
            'if(window.location.search.indexOf("qaap_oauth=")>=0)return;',
            'reloaded=true;try{location.reload();}catch(_){}});',
            '})();'
        ].join('');
        return `\n  <script type="text/javascript">${js}</script>`;
    }

    /**
     * Body of the service worker. Hand-written vanilla JS (NOT bundled), targeting modern evergreen
     * browsers. Strategy:
     *  - Precache a tiny app shell (HTML, manifest, icons, login gate) on `install`.
     *  - Navigation requests: network-first, fall back to cached shell when offline (SPA behaviour).
     *  - Application code (`bundle.js`, webpack chunks, `bundle.css`): network-first, cache as offline fallback.
     *  - Other static assets (workers, fonts, media, icons, wasm): stale-while-revalidate.
     *  - Everything else (WebSocket upgrades, plugin endpoints, file streaming, auth, APIs, sourcemaps,
     *    non-GET, Range requests) is passed through to the network untouched.
     *  - Old version caches are evicted on `activate`.
     *  - `SKIP_WAITING` message lets the page request immediate activation when the user agrees.
     */
    protected compileServiceWorker(): string {
        const cachePrefix = this.pck.props.frontend.config.applicationName
            ?.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'theia';
        const version = this.resolveServiceWorkerVersion();
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const pwaIcons = this.getPwaManifestConfig()?.icons ?? [];
        const shellExtras = new Set<string>([
            './',
            './index.html',
            './manifest.webmanifest'
        ]);
        if (appIcon) {
            shellExtras.add(appIcon.startsWith('./') || appIcon.startsWith('/') || /^https?:\/\//i.test(appIcon) ? appIcon : './' + appIcon);
        }
        for (const icon of pwaIcons) {
            shellExtras.add(icon.src);
        }
        const shellList = JSON.stringify([...shellExtras]);
        return `/* eslint-disable */
/**
 * Auto-generated PWA service worker. Edit \`FrontendGenerator.compileServiceWorker\` instead.
 *
 * Caching strategy summary:
 *   - install: precache the app shell (index.html, manifest, branding icons).
 *   - activate: evict caches that don't match the current version.
 *   - navigations: network-first with an offline fallback to the cached shell.
 *   - application code (js/css): network-first so a redeploy is always served consistently.
 *   - other static assets (wasm/fonts/media/icons): stale-while-revalidate, same-origin only.
 *   - non-GET, Range requests, WebSocket-adjacent and plugin/file/api endpoints: pass-through.
 */
'use strict';

const VERSION = ${JSON.stringify(version)};
const PREFIX = ${JSON.stringify(cachePrefix)};
const SHELL_CACHE = PREFIX + '-shell-' + VERSION;
const RUNTIME_CACHE = PREFIX + '-runtime-' + VERSION;
const SHELL_ASSETS = ${shellList};

// Endpoints that must never be served from cache. These are dynamic, websocket-adjacent, plugin
// runtime or auth surfaces - intercepting them would break the IDE.
const BYPASS_PATHS = [
    /\\/services(?:\\/|$)/,
    /\\/sockjs(?:\\/|$)/,
    /\\/hostedPlugin(?:\\/|$)/,
    /\\/webview(?:\\/|$)/,
    /\\/plugin(?:s|-)?(?:\\/|$)/,
    /\\/file(?:s)?(?:\\/|$)/,
    /\\/api(?:\\/|$)/,
    /\\/oauth(?:\\/|$)/,
    /\\/auth(?:\\/|$)/,
    /\\/qaap(?:\\/|$)/,
    /\\/qaap-(?:github-)?oauth(?:\\/|$)/,
    /\\.hot-update\\./,
    /\\.map$/
];

// Application code: bundle.js, webpack chunks and bundle.css. Served network-first so a fresh
// deploy is always picked up as a consistent whole.
const SCRIPT_EXT = /\\.(?:js|css)(?:$|\\?)/i;
// Immutable-ish assets: safe to serve stale while revalidating.
const ASSET_EXT = /\\.(?:woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico|wasm)(?:$|\\?)/i;

self.addEventListener('install', event => {
    // Take over as soon as installed so a redeployed build reaches open tabs without
    // waiting for every tab to close (otherwise stale assets linger for the whole session).
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.all(SHELL_ASSETS.map(async url => {
            try {
                await cache.add(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
            } catch (err) {
                // Non-fatal - missing shell assets shouldn't block install.
                console.warn('[sw] failed to precache', url, err);
            }
        }));
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name.startsWith(PREFIX + '-') && name !== SHELL_CACHE && name !== RUNTIME_CACHE)
            .map(name => caches.delete(name)));
        if (self.registration.navigationPreload) {
            try { await self.registration.navigationPreload.enable(); } catch (_) { /* not supported */ }
        }
        await self.clients.claim();
    })());
});

self.addEventListener('message', event => {
    const data = event.data;
    if (!data) return;
    if (data === 'SKIP_WAITING' || data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    if (req.headers.has('range')) return;

    let url;
    try { url = new URL(req.url); } catch (_) { return; }
    if (url.origin !== self.location.origin) return;
    if (BYPASS_PATHS.some(rx => rx.test(url.pathname))) return;

    if (req.mode === 'navigate' || (req.destination === '' && req.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(handleNavigate(event));
        return;
    }
    if (SCRIPT_EXT.test(url.pathname)) {
        event.respondWith(networkFirst(req));
        return;
    }
    if (ASSET_EXT.test(url.pathname)) {
        event.respondWith(staleWhileRevalidate(req));
    }
});

// Network-first for application code. A stale bundle.js references webpack chunk names that a
// newer deploy no longer serves; that mismatch fails chunk loading and hangs the IDE on the
// splash screen forever. The cache is only an offline fallback here.
async function networkFirst(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const res = await fetch(req);
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
            cache.put(req, res.clone()).catch(() => {});
        }
        return res;
    } catch (_) {
        const cached = await cache.match(req);
        return cached || new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
}

async function handleNavigate(event) {
    const req = event.request;
    try {
        const preload = event.preloadResponse ? await event.preloadResponse : undefined;
        if (preload) return preload;
        return await fetch(req);
    } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        const cached = (await cache.match(req)) || (await cache.match('./index.html')) || (await cache.match('./'));
        return cached || new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
}

async function staleWhileRevalidate(req) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
            cache.put(req, res.clone()).catch(() => {});
        }
        return res;
    }).catch(() => undefined);
    return cached || (await network) || new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

// Web Push (Qaap): show notifications when the tab is in the background.
self.addEventListener('push', event => {
    let payload = { title: 'Qaap', body: '', tag: 'qaap' };
    try {
        payload = event.data ? Object.assign(payload, event.data.json()) : payload;
    } catch (_) { /* ignore malformed payload */ }
    const title = payload.title || 'Qaap';
    const options = { body: payload.body || '', tag: payload.tag || 'qaap', data: payload };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const route = event.notification.data && event.notification.data.route;
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (clients.length > 0) {
            await clients[0].focus();
            // Tell the live app where to navigate (it may have been backgrounded, not closed).
            if (route) {
                clients[0].postMessage({ type: 'qaap-notification-route', route });
            }
            return;
        }
        // No window open — carry the route as a query param for the fresh page to read.
        await self.clients.openWindow(route ? './?qaap_route=' + encodeURIComponent(route) : './');
    })());
});
`;
    }

    /**
     * Emits the `<link rel="apple-touch-icon">` tags that iOS Safari uses for the home-screen icon.
     * Priority order:
     *   1. Explicit `pwa.appleTouchIcons` array (preferred — emits one tag per entry, with `sizes`).
     *   2. PNG entry in `pwa.icons` whose `sizes` exactly contains `180x180` (iPhone size).
     *   3. Any 192x192 or 512x512 PNG in `pwa.icons`.
     *   4. The generic `applicationIcon` as a last resort.
     *
     * Returns an HTML fragment (possibly empty) ready to splice into the `<head>`.
     */
    protected compileAppleTouchIconLinks(appIcon: string | undefined): string {
        const pwaConfig = this.getPwaManifestConfig();
        const explicit = pwaConfig?.appleTouchIcons;
        if (explicit?.length) {
            return '\n  ' + explicit.map(entry => {
                const sizes = entry.sizes?.trim();
                const sizesAttr = sizes ? ` sizes="${this.escapeHtmlAttribute(sizes)}"` : '';
                return `<link rel="apple-touch-icon"${sizesAttr} href="${this.escapeHtmlAttribute(entry.src)}">`;
            }).join('\n  ');
        }
        const icons = pwaConfig?.icons ?? [];
        const candidate = icons.find(i => i.type === 'image/png' && / 180x180(?:$|\s)/.test(' ' + i.sizes))
            ?? icons.find(i => i.type === 'image/png' && /(?:^|\s)(192x192|512x512)(?:\s|$)/.test(i.sizes))
            ?? (appIcon ? { src: appIcon, sizes: '' } as AppleTouchIcon : undefined);
        if (!candidate) {
            return '';
        }
        const sizes = (candidate.sizes ?? '').trim().split(/\s+/).find(s => /^\d+x\d+$/.test(s));
        const sizesAttr = sizes ? ` sizes="${this.escapeHtmlAttribute(sizes)}"` : '';
        return `\n  <link rel="apple-touch-icon"${sizesAttr} href="${this.escapeHtmlAttribute(candidate.src)}">`;
    }

    protected inferImageMimeType(iconPath: string): string | undefined {
        const lower = iconPath.split('?')[0].toLowerCase();
        if (lower.endsWith('.svg')) {
            return 'image/svg+xml';
        }
        if (lower.endsWith('.png')) {
            return 'image/png';
        }
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
            return 'image/jpeg';
        }
        if (lower.endsWith('.webp')) {
            return 'image/webp';
        }
        if (lower.endsWith('.ico')) {
            return 'image/x-icon';
        }
        return undefined;
    }

    protected compilePwaHeadFragment(appleTitle?: string): string {
        const light = FrontendGenerator.PWA_THEME_COLOR_LIGHT;
        const dark = FrontendGenerator.PWA_THEME_COLOR_DARK;
        const js = [
            '(function(){',
            'function syncPwaChrome(){var d=window.matchMedia(\'(prefers-color-scheme: dark)\').matches;',
            `var tc=d?${JSON.stringify(dark)}:${JSON.stringify(light)};`,
            'var sb=d?\'black-translucent\':\'default\';',
            'var m=document.querySelector(\'meta[name="theme-color"]:not([media])\');if(m){m.setAttribute(\'content\',tc);}',
            'm=document.querySelector(\'meta[name="apple-mobile-web-app-status-bar-style"]\');if(m){m.setAttribute(\'content\',sb);}',
            '}',
            'syncPwaChrome();',
            'try{window.matchMedia(\'(prefers-color-scheme: dark)\').addEventListener(\'change\',syncPwaChrome);}catch(_){}',
            '})();'
        ].join('');
        const appleTitleTag = appleTitle
            ? `\n  <meta name="apple-mobile-web-app-title" content="${this.escapeHtmlAttribute(appleTitle)}">`
            : '';
        return `
  <link rel="manifest" href="./manifest.webmanifest">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">${appleTitleTag}
  <meta name="theme-color" content="${light}" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="${dark}" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="${light}">
  <script type="text/javascript">${js}</script>`;
    }

    /**
     * Resolves `meta[name="application-icon"]` against `document.baseURI`, then sets `--theia-preload-logo-url`,
     * `--theia-workbench-brand-logo-url` (empty editor watermark), and the favicon link. Relative paths in `url()`
     * inside `bundle.css` would otherwise resolve against the stylesheet URL and can fail for `./media/...`;
     * an absolute URL avoids that.
     */
    protected compileSplashBrandingScript(): string {
        const js = [
            '(function(){try{',
            'var m=document.querySelector(\'meta[name="application-icon"]\');',
            'var r=m&&m.getAttribute(\'content\');',
            'if(!r)return;',
            'var h=r.trim();',
            'if(!h)return;',
            'var u=(/^https?:\\/\\//i.test(h)||h.startsWith(\'data:\')||h.startsWith(\'/\'))?h:new URL(h,document.baseURI).href;',
            'document.documentElement.classList.add(\'theia-splash-branded\');',
            'document.documentElement.style.setProperty(\'--theia-preload-spinner-content\',\'none\');',
            'document.documentElement.style.setProperty(\'--theia-preload-spinner-animation\',\'none\');',
            'document.documentElement.style.setProperty(\'--theia-preload-logo-url\',\'url(\' + JSON.stringify(u) + \')\');',
            'document.documentElement.style.setProperty(\'--theia-workbench-brand-logo-url\',\'url(\' + JSON.stringify(u) + \')\');',
            'var l=document.querySelector(\'link[rel="icon"]\');',
            'if(l){l.setAttribute(\'href\',u);}',
            '}catch(_){}})();'
        ].join('');
        return `\n  <script type="text/javascript">${js}</script>`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>, frontendPreloadModules: Map<string, string>): string {
        return `\
// @ts-check
require('reflect-metadata');
${this.emitStartupLogger('Frontend', 'frontend page start')}
${this.emitStartupLog('loading modules...')}
const { Container } = require('@theia/core/shared/inversify');
const { FrontendApplicationConfigProvider } = require('@theia/core/lib/browser/frontend-application-config-provider');

function applyApplicationNameFromMeta(cfg) {
    try {
        const meta = typeof document !== 'undefined' && document.querySelector('meta[name="application-name"]');
        const fromMeta = meta && meta.getAttribute('content');
        if (fromMeta && fromMeta.trim()) {
            cfg.applicationName = fromMeta.trim();
        }
    } catch {
        /* ignore: meta may be unavailable in non-browser contexts */
    }
}
function applyApplicationIconFromMeta(cfg) {
    try {
        const meta = typeof document !== 'undefined' && document.querySelector('meta[name="application-icon"]');
        const fromMeta = meta && meta.getAttribute('content');
        if (fromMeta && fromMeta.trim()) {
            cfg.applicationIcon = fromMeta.trim();
        }
    } catch {
        /* ignore: meta may be unavailable in non-browser contexts */
    }
}
const __theiaFrontendConfig = ${this.prettyStringify(this.pck.props.frontend.config)};
applyApplicationNameFromMeta(__theiaFrontendConfig);
applyApplicationIconFromMeta(__theiaFrontendConfig);
FrontendApplicationConfigProvider.set(__theiaFrontendConfig);

${this.ifMonaco(() => `
self.MonacoEnvironment = {
    getWorkerUrl: function (moduleId, label) {
        return './editor.worker.js';
    }
}`)}

function load(container, jsModule) {
    return Promise.resolve(jsModule)
        .then(containerModule => container.load(containerModule.default));
}

async function preload(container) {
    try {
${Array.from(frontendPreloadModules.values(), jsModulePath => `\
        await load(container, ${this.importOrRequire()}('${jsModulePath}'));`).join(EOL)}
        const { Preloader } = require('@theia/core/lib/browser/preload/preloader');
        const preloader = container.get(Preloader);
        await preloader.initialize();
    } catch (reason) {
        console.error('Failed to run preload scripts.');
        if (reason) {
            console.error(reason);
        }
    }
}

module.exports = (async () => {
    const { messagingFrontendModule } = require('@theia/core/lib/${this.pck.isBrowser() || this.pck.isBrowserOnly()
                ? 'browser/messaging/messaging-frontend-module'
                : 'electron-browser/messaging/electron-messaging-frontend-module'}');
    const container = new Container();
    container.load(messagingFrontendModule);
    ${this.ifBrowserOnly(`const { messagingFrontendOnlyModule } = require('@theia/core/lib/browser-only/messaging/messaging-frontend-only-module');
    container.load(messagingFrontendOnlyModule);`)}

    ${this.emitStartupLog('container created')}

    await preload(container);
    ${this.emitStartupLog('preloaded')}

    ${this.ifMonaco(() => `
    const { MonacoInit } = require('@theia/monaco/lib/browser/monaco-init');
    `)};

    const { FrontendApplication } = require('@theia/core/lib/browser');
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const { loggerFrontendModule } = require('@theia/core/lib/browser/logger-frontend-module');

    container.load(frontendApplicationModule);
    ${this.pck.ifBrowserOnly(`const { frontendOnlyApplicationModule } = require('@theia/core/lib/browser-only/frontend-only-application-module');
    container.load(frontendOnlyApplicationModule);`)}

    container.load(loggerFrontendModule);
    ${this.ifBrowserOnly(`const { loggerFrontendOnlyModule } = require('@theia/core/lib/browser-only/logger-frontend-only-module');
    container.load(loggerFrontendOnlyModule);`)}

    ${this.emitStartupLog('core modules loaded')}

    try {
${Array.from(frontendModules.values(), jsModulePath => `\
        await load(container, ${this.importOrRequire()}('${jsModulePath}'));`).join(EOL)}
        ${this.ifMonaco(() => `
        MonacoInit.init(container);
        `)};
        ${this.emitStartupLog('modules loaded')}
        await start();
    } catch (reason) {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    }

    function start() {
        (window['theia'] = window['theia'] || {}).container = container;
        ${this.emitStartupLog('resolving application')}
        const application = container.get(FrontendApplication);
        ${this.emitStartupLog('application resolved')}
        return application.start();
    }
})();
`;
    }

    protected importOrRequire(): string {
        return this.options.mode !== 'production' ? 'import' : 'require';
    }

    /** HTML for secondary windows that contain an extracted widget. */
    protected compileSecondaryWindowHtml(): string {
        const appIcon = this.pck.props.frontend.config.applicationIcon?.trim();
        const iconLines = appIcon
            ? `
    <meta name="application-icon" content="${this.escapeHtmlAttribute(appIcon)}">
    <link rel="icon" href="${this.escapeHtmlAttribute(appIcon)}">${this.compileSplashBrandingScript()}`
            : '';
        return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="application-name" content="${this.escapeHtmlAttribute(this.pck.props.frontend.config.applicationName)}">${iconLines}
    <title>${this.pck.props.frontend.config.applicationName} — Secondary Window</title>
    <style>
    html, body {
        overflow: hidden;
        -ms-overflow-style: none;
    }

    body {
        margin: 0;
    }

    html,
    head,
    body,
    .secondary-widget-root,
    #widget-host {
        width: 100% !important;
        height: 100% !important;
    }
    </style>
    <link rel="stylesheet" href="./secondary-window.css">
</head>

<body>
    <div id="widget-host"></div>
</body>

</html>`;
    }

    protected compileSecondaryIndexJs(secondaryWindowModules: Map<string, string>): string {
        return `\
// @ts-check
require('reflect-metadata');
const { Container } = require('@theia/core/shared/inversify');

module.exports = Promise.resolve().then(() => {
    const { frontendApplicationModule } = require('@theia/core/lib/browser/frontend-application-module');
    const container = new Container();
    container.load(frontendApplicationModule);
${Array.from(secondaryWindowModules.values(), jsModulePath => `\
    container.load(require('${jsModulePath}').default);`).join(EOL)}
});
`;
    }

    compilePreloadJs(): string {
        return `\
// @ts-check
${Array.from(this.pck.preloadModules.values(), path => `require('${path}').preload();`).join(EOL)}
`;
    }
}
