// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { execSync } from 'child_process';
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

async function dismissMobileTutorial(page: Page): Promise<void> {
    const skip = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skip.count()) {
        await skip.click();
    }
}

async function waitForWorkHubReady(page: Page): Promise<void> {
    await expect(page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible({ timeout: 60_000 });
}

async function openDesktopIde(app: TheiaApp): Promise<void> {
    await dismissMobileTutorial(app.page);
    await waitForWorkHubReady(app.page);

    const bottomBar = app.page.locator('#theia-mobile-bottom-bar');
    if (await bottomBar.isVisible()) {
        return;
    }

    const accountBtn = app.page.locator('.theia-workbench-account-btn').first();
    if (await accountBtn.count()) {
        await accountBtn.click();
        const openIdeMenuItem = app.page.locator('.theia-qaap-account-menu-item').filter({ hasText: /^Open IDE$/i });
        if (await openIdeMenuItem.count()) {
            await openIdeMenuItem.first().click();
        }
    }

    if (!(await bottomBar.isVisible())) {
        await app.quickCommandPalette.open();
        const input = app.page.locator(
            '#quick-input-container .monaco-inputbox .input, #quick-input-container .quick-input-and-message input'
        );
        await expect(input).toBeVisible();
        await input.fill('Open IDE');
        const openIdeRow = app.page.locator('.quick-input-list .monaco-list-row').filter({ hasText: /^Open IDE$/i });
        await expect(openIdeRow.first()).toBeVisible({ timeout: 15_000 });
        await openIdeRow.first().click();
        await app.page.waitForSelector('.quick-input-widget', { state: 'hidden', timeout: 15_000 }).catch(() => undefined);
    }

    await expect(app.page.locator('body')).not.toHaveClass(/theia-mobile-mod-landing/, { timeout: 30_000 });
    await expect(bottomBar).toBeVisible({ timeout: 30_000 });
}

test.describe('@qaap-mobile Qaap mobile layout', () => {

    test.use({ viewport: MOBILE_VIEWPORT });

    test('skips login gate and shows workbench shell', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

        await expect(app.page.locator('#theia-app-shell')).toBeVisible();
        await expect(app.page.locator('body')).not.toHaveClass(/qaap-login-active/);
        await expect(app.page.locator('#qaap-login-host')).toHaveCount(0);

        await app.page.close();
    });

    test('lands on Work Hub by default with sticky composer', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);

        await expect(app.page.locator('#theia-app-shell')).toHaveClass(/theia-mod-mobile-one-column/);
        await expect(app.page.locator('.theia-mobile-projects')).toBeVisible();
        await expect(app.page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible();
        await expect(app.page.locator('#theia-mobile-bottom-bar')).toBeHidden();

        await app.page.close();
    });

    test('opens Explorer from the mobile bottom bar after Open IDE', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
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
        await dismissMobileTutorial(app.page);
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

    test('shows project bootstrap banner for a Node dev workspace', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([LEGACY_BOOTSTRAP_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
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
        await dismissMobileTutorial(app.page);
        await openDesktopIde(app);

        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner.locator('.qaap-project-bootstrap-title')).toContainText(/Next/i);

        await app.page.close();
    });

    test('opens classic Agent chat after Open IDE', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
        await openDesktopIde(app);

        const agentBtn = app.page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]');
        await expect(agentBtn).toBeVisible();
        await agentBtn.click();

        await expect(app.page.locator('.chat-view-widget')).toBeVisible({ timeout: 15_000 });
        await expect(app.page.locator('body')).toHaveClass(/theia-mod-mobile-ai-chat-fullwidth/);

        await app.page.close();
    });

    test('command palette filter accepts text on mobile viewport', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

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

    test('classic IDE surfaces stay in one-column layout on narrow viewport', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([SAMPLE_FILES]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
        await openDesktopIde(app);

        await expect(app.page.locator('#theia-app-shell')).toHaveClass(/theia-mod-mobile-one-column/);
        await expect(app.page.locator('#theia-mobile-bottom-bar')).toBeVisible();

        await app.page.close();
    });
});

test.describe('@qaap-mobile Qaap time to preview', () => {

    test.use({ viewport: MOBILE_VIEWPORT });
    test.describe.configure({ timeout: 200_000 });

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

    test('opens dev preview within KPI window after Run & Preview', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([VITE_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);
        await openDesktopIde(app);

        const started = Date.now();
        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 30_000 });

        const runBtn = banner.locator('.qaap-project-bootstrap-action.qaap-mod-primary');
        const installBtn = banner.getByRole('button', { name: /^Install$/i });
        if (await installBtn.isVisible().catch(() => false)) {
            await installBtn.click();
            await expect(banner).toHaveAttribute('data-phase', /ready-to-run|running|starting|installing/, { timeout: 120_000 });
        }
        await expect(runBtn).toBeVisible({ timeout: 120_000 });
        const runLabel = await runBtn.textContent();
        if (runLabel && /Run|Resume|Preview/i.test(runLabel)) {
            await runBtn.click();
        }

        const previewFrame = app.page.locator(
            '.theia-mini-browser iframe[src*="127.0.0.1"], .theia-mini-browser iframe[src*="localhost"]'
        );
        await expect(previewFrame).toBeVisible({ timeout: 120_000 });

        const elapsed = Date.now() - started;
        expect(elapsed).toBeLessThan(KPI_PREVIEW_MS);

        await app.page.close();
    });
});
