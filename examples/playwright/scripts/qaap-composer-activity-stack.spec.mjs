#!/usr/bin/env node
/**
 * E2E: composer activity stack (Queued + Files) inside codex sticky composer.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.QAAP_BASE_URL ?? 'http://127.0.0.1:3000';
const CWD = process.env.QAAP_WORKSPACE ?? '/Users/jc/.qaap/workspaces/juancristobalgd1/Mockup';
const OUT_DIR = path.join(process.cwd(), 'test-results', 'composer-activity-stack');

async function readComposerActivity(page) {
    return page.evaluate(() => {
        const card = document.querySelector('.theia-mobile-projects-sticky-composer-card');
        const stack = document.querySelector('.theia-mobile-sticky-composer-activity-stack');
        const queue = document.querySelector('.theia-mobile-sticky-composer-activity-section.theia-mod-queue');
        const files = document.querySelector('.theia-mobile-sticky-composer-activity-section.theia-mod-files');
        const sendBtn = document.querySelector('.theia-mobile-projects-sticky-composer-send');
        const input = document.querySelector('.theia-mobile-projects-sticky-composer-input');
        return {
            hasCard: !!card,
            hasStack: !!stack,
            hasQueue: !!queue,
            hasFiles: !!files,
            queueTitle: queue?.querySelector('.theia-mobile-sticky-composer-activity-title')?.textContent?.trim() ?? null,
            filesTitle: files?.querySelector('.theia-mobile-sticky-composer-activity-title')?.textContent?.trim() ?? null,
            queueItemCount: queue?.querySelectorAll('.theia-mobile-sticky-composer-queue-item').length ?? 0,
            fileRowCount: files?.querySelectorAll('.theia-mobile-sticky-composer-file-row').length ?? 0,
            sendIsStop: sendBtn?.classList.contains('theia-mod-stop') ?? false,
            sendLabel: sendBtn?.getAttribute('aria-label') ?? null,
            placeholder: input?.getAttribute('placeholder') ?? null,
            cardHasActivityMod: card?.classList.contains('theia-mod-has-activity') ?? false,
        };
    });
}

async function dismissOverlays(page) {
    const skipTour = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skipTour.count()) {
        await skipTour.click();
        await page.waitForTimeout(500);
    }
}

async function openAgentsHub(page) {
    const agentBtn = page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]').first();
    if (await agentBtn.count()) {
        await agentBtn.click();
        await page.waitForTimeout(2000);
    }
}

async function openFirstSession(page) {
    let item = page.locator('.theia-mobile-projects-task-item').first();
    if (await item.count() === 0) {
        const sidebarFound = await page.evaluate(() => {
            const btn = document.querySelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar');
            return btn instanceof HTMLButtonElement;
        });
        if (sidebarFound) {
            await page.evaluate(() => {
                const btn = document.querySelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar');
                if (btn instanceof HTMLButtonElement) {
                    btn.click();
                }
            });
            await page.waitForTimeout(800);
            item = page.locator('.theia-mobile-work-hub-sessions-sidebar .theia-mobile-projects-task-item').first();
        }
    }
    if (await item.count() === 0) {
        throw new Error('No session items found');
    }
    await item.click();
    await page.waitForTimeout(3000);
}

async function fillAndSend(page, text) {
    const composer = page.locator('.theia-mobile-projects-sticky-composer-input').first();
    await composer.waitFor({ timeout: 15000 });
    await composer.fill(text);
    await page.waitForTimeout(200);
    const sendBtn = page.locator('.theia-mobile-projects-sticky-composer-send').first();
    if (await sendBtn.count()) {
        await sendBtn.click();
    } else {
        await composer.press('Enter');
    }
}

async function waitForAgentWorking(page, timeoutMs = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const state = await readComposerActivity(page);
        if (state.sendIsStop) {
            return state;
        }
        await page.waitForTimeout(800);
    }
    return readComposerActivity(page);
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    }).then(c => c.newPage());

    const log = [];
    const shot = async (name) => {
        await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: false });
    };

    try {
        await page.goto(`${BASE}/#/${encodeURIComponent(CWD)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('#theia-app-shell', { timeout: 30000 });
        await page.waitForTimeout(3000);
        await dismissOverlays(page);
        await openAgentsHub(page);
        await openFirstSession(page);

        const opened = await readComposerActivity(page);
        log.push({ step: 'session-opened', state: opened });
        await shot('01-session-opened');

        // Kick off agent turn if composer is idle.
        if (!opened.sendIsStop) {
            await fillAndSend(page, `Activity stack probe ${Date.now()}`);
            await page.waitForTimeout(2500);
            log.push({ step: 'after-kickoff-send', state: await readComposerActivity(page) });
            await shot('02-after-kickoff');
        }

        const working = await waitForAgentWorking(page);
        log.push({ step: 'agent-working', state: working });
        await shot('03-agent-working');

        const queueMsg = `Queued follow-up ${Date.now()}`;
        await fillAndSend(page, queueMsg);
        await page.waitForTimeout(1500);

        const afterQueue = await readComposerActivity(page);
        log.push({ step: 'after-queue-send', queueMsg, state: afterQueue });
        await shot('04-after-queue');

        // Wait briefly for files section during streaming.
        let withFiles = afterQueue;
        for (let i = 0; i < 8 && !withFiles.hasFiles; i++) {
            await page.waitForTimeout(1500);
            withFiles = await readComposerActivity(page);
            if (withFiles.hasFiles) {
                break;
            }
        }
        log.push({ step: 'files-poll', state: withFiles });
        await shot('05-files-poll');

        const okQueue = afterQueue.hasStack && afterQueue.hasQueue && afterQueue.queueItemCount >= 1;
        const okQueueTitle = afterQueue.queueTitle?.includes('Queued') ?? false;
        const okFilesOptional = withFiles.hasFiles ? withFiles.fileRowCount >= 1 || !!withFiles.filesTitle : true;

        const report = {
            ok: okQueue && okQueueTitle,
            okQueue,
            okQueueTitle,
            okFilesVisible: withFiles.hasFiles,
            okFilesOptional,
            log,
            screenshots: OUT_DIR,
        };
        fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));

        if (!okQueue) {
            throw new Error('Queue section did not appear in composer activity stack');
        }
        if (!okQueueTitle) {
            throw new Error(`Unexpected queue title: ${afterQueue.queueTitle}`);
        }
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
