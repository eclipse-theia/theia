// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect, test } from '@playwright/test';
import * as path from 'path';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaWorkspace } from '../theia-workspace';

const MOBILE_VIEWPORT = { width: 375, height: 812 };

test.describe('@qaap-mobile Qaap mobile layout', () => {

    test.use({ viewport: MOBILE_VIEWPORT });

    test('activates one-column shell and bottom activity bar', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

        const shell = app.page.locator('#theia-app-shell');
        await expect(shell).toHaveClass(/theia-mod-mobile-one-column/);

        const bottomBar = app.page.locator('#theia-mobile-bottom-bar');
        await expect(bottomBar).toBeVisible();

        await app.page.close();
    });

    test('collapses left explorer sheet after opening a file', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();

        await app.page.waitForSelector('#explorer-view-container--files', { state: 'visible' });
        const sampleFile = app.page.locator('#explorer-view-container--files .theia-FileStatNode', { hasText: 'sample.txt' });
        await expect(sampleFile).toBeVisible();
        await sampleFile.dblclick();
        await app.page.waitForSelector('span:has-text("content line 2")');

        await expect(app.page.locator('#theia-left-content-panel')).toHaveClass(/theia-mod-collapsed/);

        await app.page.close();
    });

    test('shows project bootstrap banner for a Node dev workspace', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, './resources/qaap-bootstrap-fixture')]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();

        const banner = app.page.locator('.qaap-project-bootstrap-banner');
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(banner).toHaveAttribute('data-phase', /detected|ready-to-run/);

        await app.page.close();
    });

    test('opens Agent chat from the mobile bottom bar', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

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

    test('getting started uses single-column layout on narrow viewport', async ({ playwright, browser }) => {
        const app = await TheiaAppLoader.load({ playwright, browser });
        await app.waitForShellAndInitialized();

        const flexDirections = await app.page.locator('.gs-container .flex-grid').evaluateAll(
            elements => elements.map(el => getComputedStyle(el).flexDirection)
        );
        expect(flexDirections.length).toBeGreaterThan(0);
        expect(flexDirections.every(direction => direction === 'column')).toBe(true);

        await app.page.close();
    });
});
