#!/usr/bin/env node
/** Debug Agents Hub: sidebar open + composer submit message visibility. */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.QAAP_BASE_URL ?? 'http://127.0.0.1:3000';
const CWD = process.env.QAAP_WORKSPACE ?? '/Users/jc/.qaap/workspaces/juancristobalgd1/Mockup';
const OUT_DIR = path.join(process.cwd(), 'test-results', 'agents-hub-chat-debug');

async function readTranscriptState(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.theia-mobile-projects');
        const root = document.querySelector('.theia-mobile-agents-hub-inline-execution');
        const transcriptRoot = document.querySelector('.theia-mobile-agents-hub-inline-transcript');
        const chatHost = document.querySelector('.theia-mobile-agent-transcript-real-chat');
        const messageHost = chatHost?.querySelector(':scope > .theia-mobile-agent-transcript') ?? chatHost;
        const userMsgs = messageHost
            ? [...messageHost.querySelectorAll('.theia-mobile-agent-transcript-msg.theia-mod-user')]
            : [];
        const agentMsgs = messageHost
            ? [...messageHost.querySelectorAll('.theia-mobile-agent-transcript-msg.theia-mod-agent')]
            : [];
        const empty = messageHost?.classList.contains('theia-mod-empty-chat');
        const composer = document.querySelector('.theia-mobile-projects-sticky-composer-input');
        const overlaySheet = document.querySelector('.theia-mobile-agent-transcript-root.theia-mod-visible');
        return {
            hubShellActive: panel?.classList.contains('theia-mod-agents-hub-shell-active') ?? false,
            inlineActive: panel?.classList.contains('theia-mod-agents-hub-inline-active') ?? false,
            stickyComposer: panel?.classList.contains('theia-mod-sticky-composer') ?? false,
            overlaySheetVisible: !!overlaySheet,
            executionRoot: !!root?.isConnected,
            activeSurface: root?.getAttribute('data-active-surface') ?? null,
            transcriptRootHidden: transcriptRoot?.hidden ?? null,
            chatHostConnected: chatHost?.isConnected ?? false,
            chatHostHidden: chatHost?.hidden ?? null,
            emptyChat: empty ?? null,
            userMessageCount: userMsgs.length,
            agentMessageCount: agentMsgs.length,
            lastUserPreview: userMsgs.at(-1)?.textContent?.trim().slice(0, 80) ?? null,
            composerVisible: composer instanceof HTMLElement && !composer.closest('[hidden]'),
            composerPlaceholder: composer?.getAttribute('placeholder') ?? null,
            headerBackVisible: !!panel?.querySelector('.theia-mobile-projects-header-back:not([hidden])'),
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

async function openSessionsSidebar(page) {
    const found = await page.evaluate(() => {
        const btn = document.querySelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar');
        return btn instanceof HTMLButtonElement;
    });
    if (!found) {
        throw new Error('Sessions sidebar toggle not found in DOM');
    }
    await page.evaluate(() => {
        const btn = document.querySelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar');
        if (!(btn instanceof HTMLButtonElement)) {
            throw new Error('Sessions sidebar toggle not found');
        }
        btn.click();
    });
    await page.waitForSelector('.theia-mobile-work-hub-sessions-sidebar.theia-mod-visible', { timeout: 10000 });
}

async function ensureAgentsHub(page) {
    const agentBtn = page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]').first();
    if (await agentBtn.count()) {
        await agentBtn.click();
        await page.waitForTimeout(2000);
    }
    const tasksChip = page.locator('button, [role="button"]').filter({ hasText: /^tasks$/i }).first();
    if (await tasksChip.count()) {
        await tasksChip.click();
        await page.waitForTimeout(1500);
    }
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    const log = [];

    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[qaap]') || text.includes('transcript')) {
            log.push({ type: 'console', text });
        }
    });

    await page.goto(`${BASE}/#/${encodeURIComponent(CWD)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#theia-app-shell', { timeout: 30000 });
    await page.waitForTimeout(3000);
    await dismissOverlays(page);

    const afterLoad = await readTranscriptState(page);
    log.push({ step: 'after-load', state: afterLoad, url: page.url() });
    await page.screenshot({ path: path.join(OUT_DIR, '01-after-load.png') });

    await ensureAgentsHub(page);
    const afterHub = await readTranscriptState(page);
    log.push({ step: 'after-agents-hub', state: afterHub });
    await page.screenshot({ path: path.join(OUT_DIR, '01b-agents-hub.png') });

    await openSessionsSidebar(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, '02-sidebar-open.png') });

    let sessionItem = page.locator('.theia-mobile-work-hub-sessions-sidebar .theia-mobile-projects-task-item').first();
    let sessionCount = await sessionItem.count();
    if (sessionCount === 0) {
        sessionItem = page.locator('.theia-mobile-projects-task-item').first();
        sessionCount = await sessionItem.count();
        log.push({ step: 'sidebar-empty-fallback-main-list', sessionCount });
    } else {
        log.push({ step: 'sidebar-sessions', sessionCount });
    }
    if (sessionCount === 0) {
        const report = { ok: false, error: 'No session items found', log, screenshots: OUT_DIR };
        console.log(JSON.stringify(report, null, 2));
        fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(OUT_DIR, 'error-no-sessions.png') });
        await browser.close();
        process.exit(1);
    }

    const sessionTitle = await sessionItem.locator('.theia-mobile-projects-task-title, .theia-mobile-projects-task-body').first().textContent().catch(() => '');
    await sessionItem.click();
    await page.waitForTimeout(3500);

    const afterSidebarClick = await readTranscriptState(page);
    log.push({ step: 'after-sidebar-click', sessionTitle: sessionTitle?.trim(), state: afterSidebarClick });
    await page.screenshot({ path: path.join(OUT_DIR, '03-after-sidebar-click.png') });

    const composer = page.locator('.theia-mobile-projects-sticky-composer-input').first();
    await composer.waitFor({ timeout: 15000 });
    const testMessage = `Playwright probe ${Date.now()}`;
    await composer.fill(testMessage);
    await page.waitForTimeout(300);

    const sendBtn = page.locator('.theia-mobile-projects-sticky-composer-send').first();
    if (await sendBtn.count()) {
        await sendBtn.click();
    } else {
        await composer.press('Enter');
    }
    await page.waitForTimeout(2500);

    const afterSend = await readTranscriptState(page);
    log.push({ step: 'after-send', testMessage, state: afterSend });
    await page.screenshot({ path: path.join(OUT_DIR, '04-after-send.png') });

    const snackbar = await page.locator('.theia-mobile-snackbar, .theia-mobile-snackbar-root').first().textContent().catch(() => '');
    log.push({ step: 'snackbar', text: snackbar?.trim() ?? '' });

    const okSidebar = afterSidebarClick.userMessageCount > 0 || afterSidebarClick.agentMessageCount > 0;
    const okSend = afterSend.userMessageCount > 0
        && (afterSend.lastUserPreview?.includes('Playwright probe') ?? false);

    const report = {
        ok: okSidebar && okSend,
        okSidebar,
        okSend,
        log,
        screenshots: OUT_DIR,
    };
    console.log(JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    await browser.close();
    if (!okSidebar) {
        throw new Error('Sidebar click did not show transcript messages');
    }
    if (!okSend) {
        throw new Error('Composer send did not show user message in transcript');
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
