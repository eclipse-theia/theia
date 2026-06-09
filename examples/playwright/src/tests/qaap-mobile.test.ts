// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { execSync, spawn, type ChildProcess } from 'child_process';
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaApp } from '../theia-app';
import { TheiaWorkspace } from '../theia-workspace';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const KPI_PREVIEW_MS = 120_000;

/** Compiled tests live under lib/tests; fixtures stay in src/tests/resources. */
const RESOURCES = path.resolve(__dirname, '../../src/tests/resources');
const SAMPLE_FILES = path.join(RESOURCES, 'sample-files1');
const VITE_FIXTURE = path.join(RESOURCES, 'qaap-vite-fixture');
const NEXT_FIXTURE = path.join(RESOURCES, 'qaap-next-fixture');
const LEGACY_BOOTSTRAP_FIXTURE = path.join(RESOURCES, 'qaap-bootstrap-fixture');

const PREVIEW_FRAME_SELECTOR = [
    '#theia-main-content-panel .theia-mini-browser iframe',
    '.theia-mini-browser iframe[src*="qaap-dev"]',
    '.theia-mini-browser iframe[src*="127.0.0.1"]',
    '.theia-mini-browser iframe[src*="localhost"]',
    '.qaap-preview-frame-slot iframe[src*="qaap-dev"]',
    '.qaap-preview-frame-slot iframe[src*="127.0.0.1"]',
    '.qaap-preview-frame-slot iframe[src*="localhost"]',
    '.theia-mobile-transcript-preview iframe[src*="qaap-dev"]',
    '.theia-mobile-transcript-preview iframe[src*="127.0.0.1"]',
    '.theia-mobile-transcript-preview iframe[src*="localhost"]',
    'iframe[src*="qaap-dev/5173"]',
    'iframe[src*="127.0.0.1:5173"]',
    'iframe[src*="localhost:5173"]',
].join(', ');

async function dismissMobileTutorial(page: Page): Promise<void> {
    const skip = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skip.count()) {
        await skip.click();
    }
}

async function waitForWorkHubReady(page: Page): Promise<void> {
    await expect(page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible({ timeout: 60_000 });
}

async function expectAgentsHubLanding(page: Page): Promise<void> {
    const hub = page.locator('.theia-mobile-projects');
    await expect(hub).toBeVisible();
    await expect(hub).toHaveClass(/theia-mod-agents-hub/);
    await expect(page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible();
    await expect(page.locator('#theia-mobile-bottom-bar')).toBeHidden();
}

async function expectWorkHubQuickActions(page: Page): Promise<void> {
    const actions = page.locator('.theia-mobile-agent-transcript-empty-action');
    await expect(actions.filter({ hasText: /Fix a bug/i })).toBeVisible();
    await expect(actions.filter({ hasText: /Explore code/i })).toBeVisible();
    await expect(actions.filter({ hasText: /Run app/i })).toBeVisible();
}

async function openDesktopIdeViaAccountMenu(page: Page): Promise<boolean> {
    const opened = await page.evaluate(() => {
        const accountBtn = [...document.querySelectorAll('.theia-workbench-account-btn')].find(
            element => element instanceof HTMLElement && element.offsetParent !== null,
        );
        if (!(accountBtn instanceof HTMLElement)) {
            return false;
        }
        accountBtn.click();
        return true;
    });
    if (!opened) {
        return false;
    }
    await page.waitForSelector('.theia-qaap-account-menu', { timeout: 10_000 });
    return page.evaluate(() => {
        const item = [...document.querySelectorAll('.theia-qaap-account-menu-item')].find(
            element => /open ide/i.test(element.textContent?.trim() ?? ''),
        );
        if (!(item instanceof HTMLElement)) {
            return false;
        }
        item.click();
        return true;
    });
}

async function openDesktopIdeViaCommandPalette(app: TheiaApp): Promise<boolean> {
    await app.page.keyboard.press('Escape');
    await app.quickCommandPalette.open();
    const input = app.page.locator(
        '#quick-input-container .monaco-inputbox .input, #quick-input-container .quick-input-and-message input'
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill('');
    await input.pressSequentially('Open IDE', { delay: 40 });

    const clicked = await app.page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const row = [...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(
            element => /open ide/i.test(element.textContent?.trim() ?? ''),
        );
        if (!(row instanceof HTMLElement)) {
            return false;
        }
        row.click();
        return true;
    });
    if (!clicked) {
        await app.page.keyboard.press('Enter');
    }
    await app.page.waitForSelector('.quick-input-widget', { state: 'hidden', timeout: 15_000 })
        .catch(() => app.page.keyboard.press('Escape'));
    return app.page.locator('#theia-mobile-bottom-bar').isVisible();
}

/** Escape hatch: Work Hub → classic mobile IDE (bottom bar + main editor). */
async function openDesktopIde(app: TheiaApp): Promise<void> {
    await dismissMobileTutorial(app.page);
    await waitForWorkHubReady(app.page);

    const bottomBar = app.page.locator('#theia-mobile-bottom-bar');
    if (await bottomBar.isVisible()) {
        return;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        if (await bottomBar.isVisible()) {
            return;
        }
        const viaMenu = await openDesktopIdeViaAccountMenu(app.page);
        if (viaMenu && await bottomBar.isVisible({ timeout: 5_000 }).catch(() => false)) {
            return;
        }
        if (await openDesktopIdeViaCommandPalette(app)) {
            return;
        }
        await app.page.waitForTimeout(800);
    }

    await expect(bottomBar).toBeVisible({ timeout: 30_000 });
    await expect(app.page.locator('body')).not.toHaveClass(/theia-mobile-mod-landing/);
    await expect(app.page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="preview"]')).toBeVisible();
}

async function expectClassicIdeSurface(page: Page): Promise<void> {
    await expect(page.locator('#theia-mobile-bottom-bar')).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/theia-mobile-mod-landing/);
    await expect(page.locator('.theia-mobile-projects-sticky-composer-input')).toHaveCount(0);
}

async function waitForBackendDevProbe(page: Page, port: number, timeoutMs: number = 60_000): Promise<void> {
    await expect.poll(async () => page.evaluate(async (probePort: number) => {
        const response = await fetch(`/qaap-dev/api/probe/${probePort}`, { cache: 'no-store' });
        if (!response.ok) {
            return false;
        }
        const body = await response.json() as { ready?: boolean };
        return body.ready === true;
    }, port), { timeout: timeoutMs }).toBe(true);
}

async function openProxiedDevPreview(app: TheiaApp, port: number): Promise<void> {
    const previewUrl = await app.page.evaluate(async (previewPort: number) => {
        const response = await fetch(`/qaap-dev/api/probe/${previewPort}`, { cache: 'no-store' });
        const body = await response.json() as { previewUrl?: string };
        return body.previewUrl ?? `${window.location.origin}/qaap-dev/${previewPort}/`;
    }, port);

    await app.quickCommandPalette.open();
    const input = app.page.locator(
        '#quick-input-container .monaco-inputbox .input, #quick-input-container .quick-input-and-message input'
    );
    await expect(input).toBeVisible();
    await input.fill('');
    await input.pressSequentially('Open URL', { delay: 40 });

    const clicked = await app.page.evaluate(async (url: string) => {
        await new Promise(resolve => setTimeout(resolve, 400));
        const row = [...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(
            element => /open url|mini-browser\.openurl/i.test(element.textContent?.trim() ?? ''),
        );
        if (row instanceof HTMLElement) {
            row.click();
            return true;
        }
        return false;
    }, previewUrl);
    if (!clicked) {
        await app.page.keyboard.press('Enter');
    }

    const urlInput = app.page.locator(
        '#quick-input-container .monaco-inputbox .input, #quick-input-container .quick-input-and-message input'
    );
    await expect(urlInput).toBeVisible({ timeout: 10_000 });
    await urlInput.fill(previewUrl);
    await app.page.keyboard.press('Enter');
    await app.page.waitForSelector('.quick-input-widget', { state: 'hidden', timeout: 15_000 })
        .catch(() => app.page.keyboard.press('Escape'));
}

async function waitForDevPreviewSurface(app: TheiaApp): Promise<void> {
    const miniBrowser = app.page.locator('#theia-main-content-panel .theia-mini-browser');
    await expect(miniBrowser).toBeVisible({ timeout: 60_000 });
}

async function waitForDevServerOnPort(port: number, timeoutMs: number = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/`);
            if (response.ok) {
                return;
            }
        } catch {
            // Server still booting.
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for dev server on port ${port}`);
}

async function startWorkspaceViteDevServer(workspacePath: string): Promise<ChildProcess> {
    try {
        execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
    } catch {
        // Port was free.
    }

    const viteDevServer = spawn(
        'npm',
        ['run', 'dev'],
        {
            cwd: workspacePath,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, NODE_ENV: 'development' },
        },
    );
    await waitForDevServerOnPort(5173);
    return viteDevServer;
}

async function expectBootstrapDetected(page: Page, phase: RegExp): Promise<void> {
    const banner = page.locator('.qaap-project-bootstrap-banner');
    await expect(banner).toBeAttached({ timeout: 30_000 });
    await expect(banner).toHaveAttribute('data-phase', phase);
}

test.describe('@qaap-mobile Work Hub (default mobile UI)', () => {

    test.use({ viewport: MOBILE_VIEWPORT });

    test('skips login gate and shows workbench shell', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

        await expect(app.page.locator('#theia-app-shell')).toBeVisible();
        await expect(app.page.locator('body')).not.toHaveClass(/qaap-login-active/);
        await expect(app.page.locator('#qaap-login-host')).toHaveCount(0);

        await app.page.close();
    });

    test('lands on Agents Work Hub with sticky composer and hidden bottom bar', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);

        await expect(app.page.locator('#theia-app-shell')).toHaveClass(/theia-mod-mobile-one-column/);
        await expectAgentsHubLanding(app.page);
        await expectWorkHubQuickActions(app.page);

        await app.page.close();
    });

    test('quick action fills the sticky composer prompt', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
        await expectAgentsHubLanding(app.page);

        await app.page.locator('.theia-mobile-agent-transcript-empty-action').filter({ hasText: /Explore code/i }).click();
        const composer = app.page.locator('.theia-mobile-projects-sticky-composer-input');
        await expect(composer).toHaveValue(/explore|architecture|codebase/i);

        await app.page.close();
    });

    test('detects bootstrap phase while Work Hub hides the banner', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([LEGACY_BOOTSTRAP_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
        await expectAgentsHubLanding(app.page);

        await expectBootstrapDetected(app.page, /detected|ready-to-run/);
        await expect(app.page.locator('.qaap-project-bootstrap-banner')).toBeHidden();

        await app.page.close();
    });

    test('command palette filter accepts text on mobile viewport', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);

        await app.quickCommandPalette.open();
        const input = app.page.locator(
            '#quick-input-container .monaco-inputbox .input, #quick-input-container .quick-input-and-message input'
        );
        await expect(input).toBeVisible();
        await input.focus();
        await input.pressSequentially('about', { delay: 40 });
        await expect(input).toHaveValue(/about/i);

        await app.quickCommandPalette.hide();
        await app.page.close();
    });
});

test.describe('@qaap-mobile Classic IDE (Open IDE escape hatch)', () => {

    test.use({ viewport: MOBILE_VIEWPORT });

    test('opens Explorer from the bottom bar', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const explorerBtn = app.page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="explore"]');
        await expect(explorerBtn).toBeVisible();
        await explorerBtn.click();

        await expect(app.page.locator('#theia-left-content-panel')).not.toHaveClass(/theia-mod-collapsed/);
        await expect(app.page.locator('#explorer-view-container--files')).toBeVisible();

        await app.page.close();
    });

    test('collapses left explorer sheet after opening a file', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const explorerBtn = app.page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="explore"]');
        await explorerBtn.click();
        await app.page.waitForSelector('#explorer-view-container--files', { state: 'visible' });
        const sampleFile = app.page.locator('#explorer-view-container--files .theia-FileStatNode', { hasText: 'sample.txt' });
        await expect(sampleFile).toBeVisible();
        await sampleFile.dblclick();
        await app.page.waitForSelector('span:has-text("content line 2")');

        await expect(app.page.locator('#theia-left-content-panel')).toHaveClass(/theia-mod-collapsed/);

        await app.page.close();
    });

    test('shows project bootstrap banner in the editor surface', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([LEGACY_BOOTSTRAP_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner).toHaveAttribute('data-phase', /detected|ready-to-run/);

        await app.page.close();
    });

    test('detects Next.js workspace in bootstrap banner', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([NEXT_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner.locator('.qaap-project-bootstrap-title')).toContainText(/Next/i);

        await app.page.close();
    });

    test('opens classic Agent chat from the bottom bar', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const agentBtn = app.page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]');
        await expect(agentBtn).toBeVisible();
        await agentBtn.click();

        await expect(app.page.locator('.chat-view-widget')).toBeVisible({ timeout: 15_000 });

        await app.page.close();
    });

    test('detects Vite workspace in bootstrap banner', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([VITE_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner).toHaveAttribute('data-phase', /ready-to-run/);
        await expect(banner.getByRole('button', { name: /run & preview/i })).toBeVisible();

        await app.page.close();
    });

    test('keeps one-column layout with visible bottom bar', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await openDesktopIde(app);

        await expect(app.page.locator('#theia-app-shell')).toHaveClass(/theia-mod-mobile-one-column/);
        await expect(app.page.locator('#theia-mobile-bottom-bar')).toBeVisible();

        await app.page.close();
    });
});

test.describe('@qaap-mobile Qaap time to preview', () => {

    test.use({ viewport: MOBILE_VIEWPORT });
    test.describe.configure({ timeout: 300_000 });

    test.beforeAll(() => {
        if (!fs.existsSync(path.join(VITE_FIXTURE, 'node_modules'))) {
            execSync('npm install --no-audit --no-fund', {
                cwd: VITE_FIXTURE,
                stdio: 'inherit',
                timeout: 180_000,
                env: { ...process.env, NODE_ENV: 'development' },
            });
        }
    });

    test.beforeEach(() => {
        try {
            execSync('lsof -ti:5173 | xargs kill -9', { stdio: 'ignore' });
        } catch {
            // Port was free.
        }
    });

    test('opens proxied dev preview within KPI window from classic IDE', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([VITE_FIXTURE]);
        let viteDevServer: ChildProcess | undefined;
        try {
            viteDevServer = await startWorkspaceViteDevServer(VITE_FIXTURE);

            const app = await TheiaAppLoader.load({ playwright, browser }, ws);
            await app.waitForShellAndInitialized();
            await openDesktopIde(app);
            await expectClassicIdeSurface(app.page);
            await waitForBackendDevProbe(app.page, 5173);

            const started = Date.now();
            await openProxiedDevPreview(app, 5173);
            await waitForDevPreviewSurface(app);

            const previewFrame = app.page.locator(PREVIEW_FRAME_SELECTOR);
            await expect(previewFrame.first()).toBeAttached({ timeout: 30_000 });

            const elapsed = Date.now() - started;
            expect(elapsed).toBeLessThan(KPI_PREVIEW_MS);

            await app.page.close();
        } finally {
            viteDevServer?.kill('SIGTERM');
        }
    });
});
