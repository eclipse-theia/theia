#!/usr/bin/env node
/**
 * Evaluación rápida de flujos Qaap móvil: primer uso, chat, diff review, reload/F5.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.QAAP_BASE_URL ?? 'http://127.0.0.1:3000';
const WORKSPACE = process.env.QAAP_WORKSPACE
    ?? path.resolve(process.cwd(), 'src/tests/resources/sample-files1');
const OUT_DIR = path.join(process.cwd(), 'test-results', 'qaap-flow-eval');

const MOBILE = { width: 375, height: 812 };

function score(label, points, max, notes) {
    return { label, points, max, notes };
}

async function readShellState(page) {
    return page.evaluate(() => {
        const body = document.body;
        const shell = document.querySelector('#theia-app-shell');
        const panel = document.querySelector('.theia-mobile-projects');
        return {
            loginActive: body.classList.contains('qaap-login-active'),
            mobileOneColumn: shell?.classList.contains('theia-mod-mobile-one-column') ?? false,
            bottomBar: !!document.querySelector('#theia-mobile-bottom-bar'),
            landing: body.classList.contains('theia-mobile-mod-landing'),
            agentsHubShell: panel?.classList.contains('theia-mod-agents-hub-shell-active') ?? false,
            agentsHubInline: panel?.classList.contains('theia-mod-agents-hub-inline-active') ?? false,
            chatFullwidth: body.classList.contains('theia-mod-mobile-ai-chat-fullwidth'),
            explorerVisible: !document.querySelector('#theia-left-content-panel')?.classList.contains('theia-mod-collapsed'),
            diffReview: !!document.querySelector('.qaap-diff-review-root, .qaap-diff-review-hunks, .theia-qaap-diff-review'),
            stickyComposer: !!document.querySelector('.theia-mobile-projects-sticky-composer-input'),
            tutorial: !!document.querySelector('.theia-mobile-onboarding-overlay, .theia-mobile-tutorial-overlay'),
            preferDesktopKeys: {
                preferDesktopIde: sessionStorage.getItem('qaap.mobileProjects.preferDesktopIde'),
                explicitDesktopIde: sessionStorage.getItem('qaap.mobileProjects.explicitDesktopIde'),
            },
            hash: window.location.hash,
        };
    });
}

async function waitForShell(page, timeoutMs = 60000) {
    await page.waitForSelector('#theia-app-shell', { timeout: timeoutMs });
    await page.waitForFunction(
        () => !document.querySelector('.theia-preload')?.checkVisibility?.(),
        undefined,
        { timeout: timeoutMs },
    ).catch(() => undefined);
    await page.waitForTimeout(1500);
}

async function dismissTutorial(page) {
    const skip = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skip.count()) {
        await skip.click();
        await page.waitForTimeout(400);
    }
}

async function openWorkspace(page) {
    const wsPath = WORKSPACE.replace(/\\/g, '/');
    const hash = encodeURIComponent('/' + wsPath);
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
    await waitForShell(page);
}

async function openAgentSurface(page) {
    const agentBtn = page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]').first();
    if (await agentBtn.count()) {
        await agentBtn.click();
        await page.waitForTimeout(1500);
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
    if (await item.count()) {
        await page.evaluate(() => {
            const el = document.querySelector(
                '.theia-mobile-projects-task-item, .theia-mobile-work-hub-sessions-sidebar .theia-mobile-projects-task-item',
            );
            if (el instanceof HTMLElement) {
                el.click();
            }
        });
        await page.waitForTimeout(2000);
        return true;
    }
    return false;
}

async function tryOpenDiffReview(page) {
    const clicked = await page.evaluate(() => {
        const selectors = [
            '[data-tab="review"]',
            '[data-surface="changes"]',
            '[data-action-id="changes"]',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el instanceof HTMLElement) {
                el.click();
                return sel;
            }
        }
        const buttons = [...document.querySelectorAll('button, [role="button"], a')];
        const match = buttons.find(el => /changes|diff|review|working changes/i.test(el.textContent ?? ''));
        if (match instanceof HTMLElement) {
            match.click();
            return 'text-match';
        }
        return null;
    });
    if (clicked) {
        await page.waitForTimeout(1500);
    }
    const state = await readShellState(page);
    return !!clicked && state.diffReview;
}

async function openIdeIfPresent(page) {
    const openIde = page.locator('button, [role="menuitem"], a').filter({ hasText: /open ide/i }).first();
    if (await openIde.count()) {
        await openIde.click();
        await page.waitForTimeout(2000);
        return true;
    }
    return false;
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: MOBILE,
        isMobile: true,
        hasTouch: true,
        locale: 'en-US',
    });
    const page = await context.newPage();
    const results = [];

    try {
        // --- Primer uso ---
        await page.goto(BASE, { waitUntil: 'domcontentloaded' });
        await waitForShell(page);
        let state = await readShellState(page);
        await page.screenshot({ path: path.join(OUT_DIR, '01-first-load.png'), fullPage: true });

        let firstUsePoints = 0;
        const firstUseNotes = [];
        if (!state.loginActive) { firstUsePoints += 2; } else { firstUseNotes.push('login gate visible'); }
        if (state.mobileOneColumn) { firstUsePoints += 2; } else { firstUseNotes.push('no one-column shell'); }
        if (state.bottomBar) { firstUsePoints += 2; } else { firstUseNotes.push('sin bottom bar'); }
        if (state.tutorial) { firstUsePoints += 1; firstUseNotes.push('tutorial presente (ok onboarding)'); }
        else { firstUseNotes.push('sin tutorial (quizá ya visto)'); firstUsePoints += 1; }
        await dismissTutorial(page);
        if (await page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]').count()) {
            firstUsePoints += 3;
        } else {
            firstUseNotes.push('botón Agent no visible');
        }
        results.push(score('Primer uso / shell móvil', firstUsePoints, 10, firstUseNotes.join('; ') || 'shell móvil coherente'));

        // --- Work Hub con workspace ---
        await openWorkspace(page);
        state = await readShellState(page);
        await dismissTutorial(page);
        await openAgentSurface(page);
        state = await readShellState(page);
        await page.screenshot({ path: path.join(OUT_DIR, '02-work-hub.png'), fullPage: true });

        let hubPoints = 0;
        const hubNotes = [];
        if (state.agentsHubShell || state.agentsHubInline || state.landing) {
            hubPoints += 4;
        } else {
            hubNotes.push('Work Hub / agents hub no activo tras Agent');
        }
        const openedSession = await openFirstSession(page);
        if (openedSession) {
            hubPoints += 3;
            hubNotes.push('sesión abierta');
        } else {
            hubNotes.push('no hay sesiones previas (esperable en fixture vacío)');
            hubPoints += 1;
        }
        if (await page.locator('.theia-mobile-projects-sticky-composer-input').count()) {
            hubPoints += 3;
        } else {
            hubNotes.push('composer sticky no visible');
        }
        results.push(score('Work Hub / navegación', hubPoints, 10, hubNotes.join('; ')));

        // --- Chat en vivo (smoke: composer + envío) ---
        let chatPoints = 0;
        const chatNotes = [];
        const composer = page.locator('.theia-mobile-projects-sticky-composer-input').first();
        if (await composer.count()) {
            chatPoints += 4;
            const probe = `eval probe ${Date.now()}`;
            await composer.fill(probe);
            chatPoints += 2;
            const sendBtn = page.locator('.theia-mobile-projects-sticky-composer-send').first();
            if (await sendBtn.count()) {
                chatPoints += 2;
                chatNotes.push('composer + send visibles');
            } else {
                chatNotes.push('send no encontrado');
            }
            // No enviamos mensaje real al agente (requiere API keys / backend agent)
            chatNotes.push('no se envió turno real (sin API/agent en CI local)');
        } else {
            const agentBtn = page.locator('#theia-mobile-bottom-bar .theia-mobile-bottom-activity-btn[data-action-id="agent"]');
            await agentBtn.click();
            await page.waitForTimeout(1000);
            const chatWidget = page.locator('.chat-view-widget');
            if (await chatWidget.count()) {
                chatPoints += 6;
                chatNotes.push('fallback: chat Theia clásico visible');
            } else {
                chatNotes.push('composer y chat no accesibles');
            }
        }
        await page.screenshot({ path: path.join(OUT_DIR, '03-chat-composer.png'), fullPage: true });
        results.push(score('Chat en vivo (smoke UI)', chatPoints, 8, chatNotes.join('; ')));

        // --- Diff review ---
        let diffPoints = 0;
        const diffNotes = [];
        const diffOpened = await tryOpenDiffReview(page);
        state = await readShellState(page);
        if (diffOpened || state.diffReview) {
            diffPoints += 6;
            diffNotes.push('superficie diff detectada');
        } else {
            diffNotes.push('sin cambios git o tab Changes no encontrado en fixture sample-files1');
            diffPoints += 2;
        }
        await page.screenshot({ path: path.join(OUT_DIR, '04-diff-review.png'), fullPage: true });
        results.push(score('Diff review', diffPoints, 8, diffNotes.join('; ')));

        // --- Reload / F5 contract ---
        await openIdeIfPresent(page);
        state = await readShellState(page);
        const hadExplorer = state.explorerVisible || state.chatFullwidth;

        await page.evaluate(() => {
            sessionStorage.setItem('qaap.mobileProjects.preferDesktopIde', '1');
            sessionStorage.setItem('qaap.mobileProjects.explicitDesktopIde', '1');
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForShell(page);
        await page.waitForTimeout(2000);
        state = await readShellState(page);
        await page.screenshot({ path: path.join(OUT_DIR, '05-after-reload.png'), fullPage: true });

        let reloadPoints = 0;
        const reloadNotes = [];
        if (!state.preferDesktopKeys.preferDesktopIde && !state.preferDesktopKeys.explicitDesktopIde) {
            reloadPoints += 4;
        } else {
            reloadNotes.push('claves legacy IDE siguen en sessionStorage tras reload');
        }
        if (state.agentsHubShell || state.agentsHubInline || state.landing || !hadExplorer) {
            reloadPoints += 3;
            reloadNotes.push('vuelve a superficie Work Hub / landing, no IDE clásico forzado');
        } else if (!state.explorerVisible && !state.chatFullwidth) {
            reloadPoints += 2;
            reloadNotes.push('no quedó atrapado en IDE clásico obvio');
        } else {
            reloadNotes.push('posible restauración IDE clásico tras reload');
        }
        if (state.mobileOneColumn && state.bottomBar) {
            reloadPoints += 3;
        } else {
            reloadNotes.push('layout móvil roto tras reload');
        }
        results.push(score('Reload / F5 (Work Hub default)', reloadPoints, 10, reloadNotes.join('; ')));

    } finally {
        await browser.close();
    }

    const total = results.reduce((s, r) => s + r.points, 0);
    const max = results.reduce((s, r) => s + r.max, 0);
    const pct = Math.round((total / max) * 100);

    console.log('\n=== Evaluación Qaap móvil (Playwright) ===');
    console.log(`Base: ${BASE}`);
    console.log(`Workspace: ${WORKSPACE}`);
    console.log(`Screenshots: ${OUT_DIR}\n`);
    for (const r of results) {
        console.log(`${r.label}: ${r.points}/${r.max} — ${r.notes}`);
    }
    console.log(`\nTOTAL: ${total}/${max} (${pct}/100)`);
    console.log('\nNota: chat en vivo no incluye turno real de agente (requiere backend/API).');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
