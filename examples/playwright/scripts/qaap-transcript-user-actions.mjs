#!/usr/bin/env node
/** Verify transcript user bubble hover actions (edit / copy / undo). */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const CWD = '/Users/jc/.qaap/workspaces/juancristobalgd1/Mockup';

async function openProjectTasks(page) {
    await page.goto(`${BASE}/#/${encodeURIComponent(CWD)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#theia-app-shell', { timeout: 30000 });
    await page.waitForTimeout(2000);
    const tasksChip = page.locator('button').filter({ hasText: /tasks/i }).first();
    if (await tasksChip.count()) {
        await tasksChip.click();
        await page.waitForTimeout(1500);
    }
}

    const taskItem = page.locator('.theia-mobile-projects-task-item').first();
    await taskItem.waitFor({ timeout: 20000 });
    await taskItem.click();

    await page.waitForSelector('.theia-mobile-agent-transcript-root.theia-mod-visible', { timeout: 20000 });
    const userWrap = page.locator('.theia-mobile-agent-transcript-user-wrap').first();
    await userWrap.waitFor({ timeout: 10000 });
    await userWrap.hover();

    const actions = page.locator('.theia-mobile-agent-transcript-user-actions').first();
    await actions.waitFor({ state: 'visible', timeout: 5000 });

    const editBtn = page.locator('.theia-mobile-agent-transcript-user-action.theia-mod-edit').first();
    const copyBtn = page.locator('.theia-mobile-agent-transcript-user-action.theia-mod-copy').first();
    const undoBtn = page.locator('.theia-mobile-agent-transcript-user-action.theia-mod-undo').first();

    for (const [name, btn] of [['edit', editBtn], ['copy', copyBtn], ['undo', undoBtn]]) {
        if (!(await btn.count())) {
            throw new Error(`[${label}] Missing ${name} button`);
        }
    }

    const expectedText = await userWrap.locator('.theia-mobile-agent-transcript-content').innerText();
    await copyBtn.click();
    await page.waitForTimeout(400);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    if (!clipboard.trim() || !expectedText.includes(clipboard.trim().slice(0, 12))) {
        throw new Error(`[${label}] Copy mismatch: clipboard="${clipboard.slice(0, 40)}" expected~="${expectedText.slice(0, 40)}"`);
    }

    await editBtn.click();
    await page.waitForTimeout(500);
    const composer = page.locator('.theia-mobile-projects-sticky-composer-input').first();
    await composer.waitFor({ timeout: 5000 });
    const draft = await composer.inputValue();
    if (!draft.trim()) {
        throw new Error(`[${label}] Edit did not populate composer`);
    }

    return { label, copyVerified: true, editDraftLen: draft.length, userPreview: expectedText.slice(0, 40) };
}

async function main() {
    const browser = await chromium.launch({ headless: true });

    const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        permissions: ['clipboard-read', 'clipboard-write'],
        isMobile: true,
        hasTouch: true,
    });
    const desktop = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
    });

    const results = [];
    results.push(await verifyTranscriptActions(await mobile.newPage(), 'mobile'));
    results.push(await verifyTranscriptActions(await desktop.newPage(), 'desktop'));

    console.log(JSON.stringify({ ok: true, results }, null, 2));
    await browser.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
