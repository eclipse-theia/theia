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
const RUN_APP_PROMPT = /figure out how to build and run/i;

async function dismissMobileTutorial(page: import('@playwright/test').Page): Promise<void> {
    const skip = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skip.count()) {
        await skip.click();
    }
}

test.describe('@qaap-mobile agent auto-continue after exploration stop', () => {
    test.use({ viewport: MOBILE_VIEWPORT });
    test.describe.configure({ timeout: 300_000 });

    test('continues run-app task after search-only agent stop', async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([VITE_FIXTURE]);
        const app = await TheiaAppLoader.load({ playwright, browser }, ws);
        await app.waitForShellAndInitialized();
        await dismissMobileTutorial(app.page);

        await expect(app.page.locator('.theia-mobile-projects-sticky-composer-input')).toBeVisible({ timeout: 60_000 });

        await app.page.locator('.theia-mobile-agent-transcript-empty-action').filter({ hasText: /Run app/i }).click();
        const composer = app.page.locator('.theia-mobile-projects-sticky-composer-input');
        await expect(composer).toHaveValue(RUN_APP_PROMPT);
        await app.page.getByRole('button', { name: /^send$|^create$/i }).click();

        const workspaceCwd = ws.path;

        await expect.poll(async () => {
            const state = await app.page.evaluate(async (cwd: string) => {
                const listResponse = await fetch(`/qaap/api/agent-conversations?cwd=${encodeURIComponent(cwd)}`, { credentials: 'include' });
                if (!listResponse.ok) {
                    return { ok: false, reason: 'list-failed' };
                }
                const listBody = await listResponse.json() as { conversations?: Array<{ id: string; updatedAt: number }> };
                const conversations = listBody.conversations ?? [];
                if (!conversations.length) {
                    return { ok: false, reason: 'no-conversation' };
                }
                const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
                const detailResponse = await fetch(`/qaap/api/agent-conversations/${encodeURIComponent(latest.id)}`, { credentials: 'include' });
                if (!detailResponse.ok) {
                    return { ok: false, reason: 'detail-failed' };
                }
                const conv = await detailResponse.json() as {
                    status: string;
                    messages: Array<{
                        role: string;
                        content: string;
                        segments?: Array<{ type: string; name?: string; finished?: boolean }>;
                    }>;
                };
                const autoContinue = conv.messages.some(message =>
                    message.role === 'user' && /continue this task now/i.test(message.content));
                const hasBash = conv.messages.some(message =>
                    message.segments?.some(segment =>
                        segment.type === 'tool'
                        && segment.finished
                        && /bash|shell|terminal/i.test(segment.name ?? '')));
                const userTurns = conv.messages.filter(message => message.role === 'user').length;
                const agentStreaming = conv.status === 'streaming' && userTurns > 1;
                return {
                    ok: autoContinue || hasBash || agentStreaming,
                    autoContinue,
                    hasBash,
                    agentStreaming,
                    userTurns,
                    status: conv.status,
                };
            }, workspaceCwd);
            return state;
        }, { timeout: 240_000 }).toMatchObject({ ok: true });

        await app.page.close();
    });
});
