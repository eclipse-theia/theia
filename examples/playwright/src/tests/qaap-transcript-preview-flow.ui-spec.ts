// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect, test } from '@playwright/test';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaWorkspace } from '../theia-workspace';
import * as path from 'path';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const VITE_FIXTURE = path.join(path.resolve(__dirname, '../../src/tests/resources'), 'qaap-vite-fixture');

async function dismissMobileTutorial(page: import('@playwright/test').Page): Promise<void> {
    const skip = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skip.count()) {
        await skip.click();
    }
}

test.describe('@qaap-mobile transcript dev preview flow', () => {
    test.use({ viewport: MOBILE_VIEWPORT });
    test.describe.configure({ timeout: 300_000 });

    test('levanta la app switches to Preview and mounts proxied iframe', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([VITE_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);

        await expect(app.page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible({ timeout: 60_000 });

        const composer = app.page.locator('.theia-mobile-projects-sticky-composer-input');
        await composer.fill('levanta la app');
        await app.page.getByRole('button', { name: /^send$|^create$/i }).click();

        await expect(app.page.getByRole('heading', { name: /levanta la app/i })).toBeVisible({ timeout: 60_000 });

        await expect.poll(async () => {
            const state = await app.page.evaluate(async () => {
                const response = await fetch('/qaap-dev/api/probe/5173', { cache: 'no-store' });
                const probeReady = response.ok
                    ? ((await response.json()) as { ready?: boolean }).ready === true
                    : false;
                const onPreview = document.querySelector('[data-active-surface="preview"]') !== null;
                const iframe = document.querySelector('iframe[src*="qaap-dev/5173"]') !== null;
                return probeReady && onPreview && iframe;
            });
            return state;
        }, { timeout: 180_000 }).toBe(true);

        await app.page.close();
    });
});
