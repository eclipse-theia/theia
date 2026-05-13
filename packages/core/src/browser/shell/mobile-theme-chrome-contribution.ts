// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
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

import { inject, injectable } from 'inversify';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { getThemeMode, isHighContrast } from '../../common/theme';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { ThemeService } from '../theming';

/**
 * Synchronizes the browser chrome (Android tab bar / iOS web-app status bar / installed PWA
 * splash) with the **active Theia color theme**, instead of leaving it pinned to the static
 * light/dark values emitted by the generator at build time.
 *
 * The contribution writes:
 *   - `<meta name="theme-color" content="...">` for Chromium/Firefox mobile + PWA.
 *   - `<meta name="apple-mobile-web-app-status-bar-style" content="default|black|black-translucent">`
 *     so the iOS status bar text contrasts with the underlying menubar/title-bar background.
 *
 * The source color is read from `--theia-titleBar-activeBackground` (when present) or, as a
 * fallback, `--theia-statusBar-background`; both follow the active theme. We resolve them via
 * `getComputedStyle` after the theme has been applied to `document.body`, so theme-mediator
 * extensions are also picked up.
 */
@injectable()
export class MobileThemeChromeContribution implements FrontendApplicationContribution {

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    protected readonly toDispose = new DisposableCollection();
    protected resyncRaf = 0;
    protected mediaListenerInstalled = false;

    onStart(): void {
        if (typeof document === 'undefined') {
            return;
        }
        void this.themeService.initialized.then(() => this.scheduleResync());
        this.toDispose.push(this.themeService.onDidColorThemeChange(() => this.scheduleResync()));
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !this.mediaListenerInstalled) {
            const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
            const onChange = (): void => this.scheduleResync();
            colorScheme.addEventListener('change', onChange);
            this.toDispose.push(Disposable.create(() => colorScheme.removeEventListener('change', onChange)));
            this.mediaListenerInstalled = true;
        }
    }

    onStop(): void {
        if (this.resyncRaf) {
            cancelAnimationFrame(this.resyncRaf);
            this.resyncRaf = 0;
        }
        this.toDispose.dispose();
    }

    protected scheduleResync(): void {
        if (typeof window === 'undefined' || this.resyncRaf) {
            return;
        }
        // Theme application toggles classes on `<body>` / `<html>`, which only materializes in
        // `getComputedStyle` after the layout/paint cycle. One frame's enough.
        this.resyncRaf = requestAnimationFrame(() => {
            this.resyncRaf = 0;
            this.applyChrome();
        });
    }

    protected applyChrome(): void {
        const color = this.resolveChromeColor();
        if (!color) {
            return;
        }
        this.setMeta('theme-color', color);
        this.setAppleStatusBarStyle();
    }

    /**
     * iOS Safari ignores `theme-color`; it instead reads `apple-mobile-web-app-status-bar-style`.
     *   - 'default'           → black text on white bar.
     *   - 'black'             → white text on black bar.
     *   - 'black-translucent' → web view is drawn under a translucent overlay status bar.
     * The translucent value matches dark themes best because the underlying chrome can then
     * show through. High-contrast variants use 'black' (their backgrounds are solid).
     */
    protected setAppleStatusBarStyle(): void {
        const current = this.themeService.getCurrentTheme();
        const themeType = current?.type ?? 'dark';
        let style: 'default' | 'black' | 'black-translucent';
        if (themeType === 'light' || themeType === 'hcLight') {
            style = 'default';
        } else if (isHighContrast(themeType)) {
            style = 'black';
        } else {
            style = getThemeMode(themeType) === 'dark' ? 'black-translucent' : 'default';
        }
        this.setMeta('apple-mobile-web-app-status-bar-style', style);
    }

    /**
     * Try the menubar/title-bar color first (it sits at the very top of the workbench and is
     * what the OS chrome physically butts against), then fall back to the status-bar token.
     * Both are guaranteed to exist on a Theia install and follow the active theme.
     */
    protected resolveChromeColor(): string | undefined {
        if (typeof document === 'undefined' || typeof window === 'undefined') {
            return undefined;
        }
        const root = document.body || document.documentElement;
        const styles = window.getComputedStyle(root);
        const candidates = [
            '--theia-titleBar-activeBackground',
            '--theia-menubar-background',
            '--theia-statusBar-background',
            '--theia-editor-background',
        ];
        for (const variable of candidates) {
            const raw = styles.getPropertyValue(variable).trim();
            const hex = this.toHexColor(raw);
            if (hex) {
                return hex;
            }
        }
        return undefined;
    }

    /**
     * Normalize CSS color expressions to a `#rrggbb` (or `#rrggbbaa`) hex string. The
     * `theme-color` meta tag accepts plain CSS colors in modern browsers, but Safari + older
     * Chrome (and PWA install banners) are strict about the format, so we canonicalize.
     */
    protected toHexColor(raw: string): string | undefined {
        if (!raw) {
            return undefined;
        }
        if (raw.startsWith('#')) {
            return raw;
        }
        // Reuse the browser's parser by setting it on an offscreen element and reading back the
        // computed RGB tuple. This handles `rgb(...)`, `rgba(...)`, `hsl(...)`, `color-mix(...)`
        // and named colors uniformly across browsers.
        if (typeof document === 'undefined') {
            return undefined;
        }
        const probe = document.createElement('span');
        probe.style.color = 'transparent';
        probe.style.color = raw;
        document.body.appendChild(probe);
        const computed = window.getComputedStyle(probe).color;
        probe.remove();
        const match = computed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/);
        if (!match) {
            return undefined;
        }
        const [r, g, b, a] = [match[1], match[2], match[3], match[4]].map(Number);
        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
            return undefined;
        }
        const channels = [r, g, b]
            .map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
            .join('');
        if (Number.isFinite(a) && a < 1) {
            const alphaHex = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
            return `#${channels}${alphaHex}`;
        }
        return `#${channels}`;
    }

    protected setMeta(name: string, content: string): void {
        let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', name);
            document.head.appendChild(meta);
        }
        if (meta.getAttribute('content') !== content) {
            meta.setAttribute('content', content);
        }
    }
}
