#!/usr/bin/env node
/**
 * Diagnose empty-editor watermark state at http://localhost:3000
 * Usage: node scripts/debug-watermark-state.mjs
 */
import { chromium, devices } from 'playwright';

const url = process.env.QAAP_URL || 'http://localhost:3000';

async function probe(page, label) {
    return page.evaluate(l => {
        const shell = document.getElementById('theia-app-shell');
        const panel = document.getElementById('theia-main-content-panel');
        const shellIds = shell ? [...shell.querySelectorAll('[id]')].map(e => e.id).filter(Boolean).slice(0, 30) : [];
        const containers = panel ? [...panel.querySelectorAll('.editor-group-container')] : [];
        const watermarks = panel ? [...panel.querySelectorAll('.editor-group-watermark')] : [];
        const tabs = panel ? panel.querySelectorAll('.lm-TabBar-tab').length : 0;
        const monaco = panel ? panel.querySelectorAll('.monaco-editor').length : 0;
        const mini = panel ? panel.querySelectorAll('.theia-mini-browser').length : 0;
        const emptyAttr = containers.filter(c => c.hasAttribute('data-qaap-editor-group-empty')).length;
        const letterpress = panel ? panel.querySelectorAll('.letterpress').length : 0;
        const qaapRows = panel ? panel.querySelectorAll('.qaap-watermark-entry').length : 0;
        const shellOverlay = document.querySelectorAll('.qaap-empty-workbench-brand, .qaap-mobile-empty-brand').length;
        const wmStyles = watermarks.slice(0, 1).map(w => {
            const s = getComputedStyle(w);
            return { display: s.display, visibility: s.visibility, height: s.height, opacity: s.opacity, rect: w.getBoundingClientRect() };
        });
        return {
            label: l,
            hasShell: !!shell,
            shellIds,
            hasPanel: !!panel,
            containers: containers.length,
            watermarks: watermarks.length,
            emptyAttr,
            tabs,
            monaco,
            mini,
            letterpress,
            qaapRows,
            shellOverlay,
            splash: document.documentElement.classList.contains('theia-splash-branded'),
            wmStyles
        };
    }, label);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForSelector('#theia-app-shell', { timeout: 120000 }).catch(() => undefined);
for (let i = 0; i < 30; i++) {
    const hasPanel = await page.$('#theia-main-content-panel');
    if (hasPanel) break;
    await page.waitForTimeout(2000);
}
await page.waitForTimeout(3000);

const r1 = await probe(page, 'initial');
console.log(JSON.stringify(r1, null, 2));

await browser.close();
