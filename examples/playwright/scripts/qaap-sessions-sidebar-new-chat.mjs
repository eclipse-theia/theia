#!/usr/bin/env node
/** Verify sidebar "New chat" opens VPS task composer (not locked local Coder chat). */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const CWD = '/Users/jc/.qaap/workspaces/juancristobalgd1/Mockup';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/#/${encodeURIComponent(CWD)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#theia-app-shell', { timeout: 30000 });
    await page.waitForTimeout(2500);

    await page.waitForSelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar', { timeout: 15000 });
    await page.evaluate(() => {
        const btn = document.querySelector('.theia-workbench-nav-btn.theia-mod-mobile-sessions-sidebar');
        if (!(btn instanceof HTMLButtonElement)) {
            throw new Error('Sessions sidebar toggle button not found');
        }
        btn.click();
    });
    await page.waitForSelector('.theia-mobile-work-hub-sessions-sidebar.theia-mod-visible', { timeout: 10000 });

    const newChatBtn = page.locator('.theia-mobile-work-hub-sessions-sidebar-nav-item').filter({ hasText: /new chat/i }).first();
    await newChatBtn.waitFor({ timeout: 5000 });
    await newChatBtn.click();
    await page.waitForTimeout(1500);

    const composer = page.locator('.theia-mobile-projects-sticky-composer-input').first();
    await composer.waitFor({ timeout: 15000 });
    const placeholder = await composer.getAttribute('placeholder');
    if (/reply in local chat/i.test(placeholder ?? '')) {
        throw new Error(`Still on local chat composer. placeholder="${placeholder}"`);
    }
    if (!/delegate a task/i.test(placeholder ?? '')) {
        throw new Error(`Expected idle Agents placeholder, got: "${placeholder}"`);
    }

    const agentBtn = page.locator('.theia-mobile-projects-sticky-composer-agent').first();
    await agentBtn.waitFor({ timeout: 5000 });
    if (await agentBtn.isDisabled()) {
        throw new Error('Agent selector is disabled (Coder-only local chat path)');
    }
    if (await agentBtn.evaluate(el => el.classList.contains('theia-mod-locked'))) {
        throw new Error('Agent selector is locked (theia-mod-locked)');
    }

    const agentLabel = await agentBtn.getAttribute('aria-label');
    await page.evaluate(() => {
        const btn = document.querySelector('.theia-mobile-projects-sticky-composer-agent:not(.theia-mod-locked)');
        if (!(btn instanceof HTMLButtonElement) || btn.disabled) {
            throw new Error('Agent selector not clickable');
        }
        btn.click();
    });
    await page.waitForSelector('.theia-mobile-sticky-composer-sheet', { timeout: 10000 });
    const options = page.locator('.theia-mobile-sticky-composer-sheet-option');
    const optionCount = await options.count();
    if (optionCount < 1) {
        throw new Error('Agent sheet opened but has no agent options');
    }

    const title = await page.locator('.theia-mobile-agent-log-header h2, .theia-mobile-agents-hub-inline-execution h2').first().textContent().catch(() => '');
    console.log(JSON.stringify({
        ok: true,
        placeholder,
        agentLabel,
        agentOptions: optionCount,
        title: (title ?? '').trim(),
    }, null, 2));

    await browser.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
