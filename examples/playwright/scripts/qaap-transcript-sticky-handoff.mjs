#!/usr/bin/env node
/**
 * Verify transcript user-query sticky handoff at scroll intersections (mobile viewport).
 * Requires: npm run build:browser && npm run start:browser on :3000
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.QAAP_BASE_URL ?? 'http://127.0.0.1:3000';
const CWD = process.env.QAAP_WORKSPACE ?? '/Users/jc/.qaap/workspaces/juancristobaldgd1/Mockup';
const OUT_DIR = path.join(process.cwd(), 'test-results', 'transcript-sticky-handoff');

async function openTranscript(page) {
    await page.goto(`${BASE}/#/${encodeURIComponent(CWD)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#theia-app-shell', { timeout: 30000 });
    await page.waitForTimeout(2500);
    const skipTour = page.locator('button').filter({ hasText: /^skip$/i }).first();
    if (await skipTour.count()) {
        await skipTour.click();
        await page.waitForTimeout(600);
    }
    const continueCard = page.locator('button, [role="button"]').filter({ hasText: /corre todas las pruebas/i }).first();
    const taskItem = page.locator('.theia-mobile-projects-task-item').first();
    if (await continueCard.count()) {
        await continueCard.click();
    } else if (await taskItem.count()) {
        await taskItem.click();
    } else {
        const mo = page.locator('button, [role="button"]').filter({ hasText: /^MO$/ }).first();
        if (await mo.count()) {
            await mo.click();
            await page.waitForTimeout(800);
            await page.locator('.theia-mobile-projects-task-item').first().click({ timeout: 15000 });
        } else {
            throw new Error('No continue card, task item, or workspace entry found to open transcript');
        }
    }
    await page.waitForSelector('.theia-mobile-agent-transcript-root.theia-mod-visible', { timeout: 25000 });
    return page.locator('.theia-mobile-agent-transcript').first();
}

async function readStickyState(scroller) {
    return scroller.evaluate(el => {
        const scrollerRect = el.getBoundingClientRect();
        const wraps = [...el.querySelectorAll('.theia-mobile-agent-transcript-user-wrap')];
        const stuck = wraps
            .map((wrap, index) => ({
                index,
                stuck: wrap.classList.contains('theia-mod-sticky-stuck'),
                compact: Boolean(wrap.querySelector('.theia-mobile-agent-transcript-content.theia-mod-sticky-compact')),
                top: wrap.getBoundingClientRect().top - scrollerRect.top,
                scrollTop: el.scrollTop,
            }))
            .filter(w => w.stuck);
        return {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            stuckCount: stuck.length,
            stuck,
            userCount: wraps.length,
        };
    });
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
    const scroller = await openTranscript(page);
    await scroller.waitFor({ timeout: 15000 });

    const userCount = await scroller.locator('.theia-mobile-agent-transcript-user-wrap').count();
    if (userCount < 1) {
        throw new Error(`Expected at least one user message, found ${userCount}`);
    }

    const samples = [];
    const maxScroll = await scroller.evaluate(el => el.scrollHeight - el.clientHeight);
    const steps = 12;
    for (let step = 0; step <= steps; step++) {
        const top = Math.round((maxScroll * step) / steps);
        await scroller.evaluate((el, y) => { el.scrollTop = y; }, top);
        await page.waitForTimeout(280);
        const state = await readStickyState(scroller);
        samples.push({ step, targetTop: top, ...state });
        await page.screenshot({
            path: path.join(OUT_DIR, `step-${String(step).padStart(2, '0')}.png`),
            fullPage: false,
        });
        if (state.stuckCount > 1) {
            throw new Error(`Step ${step}: more than one stuck preview (${state.stuckCount}): ${JSON.stringify(state.stuck)}`);
        }
    }

    const handoffSteps = samples.filter(s => s.stuckCount === 1);
    if (userCount > 1 && handoffSteps.length < 2) {
        throw new Error(`Expected sticky handoff across scroll, got ${handoffSteps.length} stuck steps / ${userCount} users`);
    }

    const stuckIndices = [...new Set(handoffSteps.map(s => s.stuck[0]?.index).filter(i => i !== undefined))];
    await scroller.evaluate(el => { el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) * 0.45); });
    await page.waitForTimeout(500);
    const clickTarget = page.locator('.theia-mobile-agent-transcript-user-wrap.theia-mod-sticky-stuck .theia-mobile-agent-transcript-msg').first();
    if (await clickTarget.count()) {
        const beforeClick = await readStickyState(scroller);
        await clickTarget.click({ force: true });
        await page.waitForTimeout(900);
        const afterClick = await readStickyState(scroller);
        if (afterClick.scrollTop >= beforeClick.scrollTop && beforeClick.stuckCount === 1) {
            console.warn('warn: tap on stuck chip did not scroll upward; may already be at anchor');
        }
        await page.screenshot({ path: path.join(OUT_DIR, 'after-jump-click.png'), fullPage: false });
    }

    console.log(JSON.stringify({
        ok: true,
        userCount,
        stuckIndices,
        samples: samples.map(s => ({
            step: s.step,
            targetTop: s.targetTop,
            stuckCount: s.stuckCount,
            stuckIndex: s.stuck[0]?.index,
            compact: s.stuck[0]?.compact,
        })),
        screenshots: OUT_DIR,
    }, null, 2));

    await browser.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
