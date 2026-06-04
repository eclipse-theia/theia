#!/usr/bin/env node
/**
 * Verify transcript user-query sticky handoff at scroll intersections (mobile viewport).
 * Requires: npm run build:browser && npm run start:browser on :3000
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.QAAP_BASE_URL ?? 'http://127.0.0.1:3000';
const CWD = process.env.QAAP_WORKSPACE ?? '/Users/jc/.qaap/workspaces/juancristobalgd1/Mockup';
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
                suppressed: wrap.classList.contains('theia-mod-sticky-suppressed'),
                compact: Boolean(wrap.querySelector('.theia-mobile-agent-transcript-content.theia-mod-sticky-compact')),
                top: wrap.getBoundingClientRect().top - scrollerRect.top,
                scrollTop: el.scrollTop,
            }))
            .filter(w => w.stuck);
        return {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            stuckCount: stuck.length,
            suppressedCount: wraps.filter(wrap => wrap.classList.contains('theia-mod-sticky-suppressed')).length,
            visiblePinnedCount: wraps.filter(wrap => {
                if (!wrap.classList.contains('theia-mod-sticky-stuck')) {
                    return false;
                }
                return getComputedStyle(wrap.querySelector('.theia-mobile-agent-transcript-msg.theia-mod-user')).visibility !== 'hidden';
            }).length,
            stuck,
            userCount: wraps.length,
        };
    });
}

async function setTranscriptScrollTop(scroller, page, top) {
    await scroller.evaluate((el, y) => {
        el.scrollTop = y;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
    }, top);
    await page.waitForTimeout(280);
}

async function ensureLongUserFixture(scroller, page) {
    await scroller.evaluate(el => {
        const longText = [
            'Fixture long user prompt for sticky transcript verification.',
            'Line two keeps the orange bubble tall enough to exceed the compact threshold.',
            'Line three should remain readable before the fade begins.',
            'Line four validates that normal flow still contains the full message.',
            'Line five is the last visible preview line.',
            'Line six must be hidden behind the gradient and ellipsis.',
            'Line seven confirms there is more content after the preview.',
            'Line eight confirms tap-to-jump returns to the natural full bubble.',
            'Additional wrapped text '.repeat(180),
        ].join('\n\n');

        const agentFiller = (label, lines = 14) => {
            const row = document.createElement('div');
            row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
            row.dataset.qaapStickyFixture = 'true';
            const content = document.createElement('div');
            content.className = 'theia-mobile-agent-transcript-content';
            content.textContent = Array.from({ length: lines }, (_, index) => `${label} response line ${index + 1}.`).join('\n');
            row.append(content);
            return row;
        };
        const user = (text, id) => {
            const wrap = document.createElement('div');
            wrap.className = 'theia-mobile-agent-transcript-user-wrap';
            wrap.dataset.messageId = `qaap-sticky-fixture-${id}`;
            wrap.dataset.qaapStickyFixture = 'true';
            const row = document.createElement('div');
            row.className = 'theia-mobile-agent-transcript-msg theia-mod-user';
            const content = document.createElement('div');
            content.className = 'theia-mobile-agent-transcript-content';
            content.textContent = text;
            row.append(content);
            wrap.append(row);
            return wrap;
        };

        el.replaceChildren(
            user('Short fixture question before the long prompt.', 'short-a'),
            agentFiller('First fixture', 18),
            user(longText, 'long'),
            agentFiller('Second fixture', 20),
            user('Short fixture question after the long prompt.', 'short-b'),
            agentFiller('Third fixture', 12),
        );
        el.scrollTop = 0;
    });
    await page.waitForTimeout(300);
}

async function ensureLastLongUserFixture(scroller, page) {
    await scroller.evaluate(el => {
        const longText = [
            'Final long user prompt that should not become sticky while the newest AI answer is being read.',
            'This is intentionally long enough to exceed five lines in the mobile bubble.',
            'The transcript should keep this full message in natural flow only.',
            'No compact fixed preview should cover the final answer below.',
            'Extra wrapped text '.repeat(180),
        ].join('\n\n');

        const agentFiller = (label, lines = 18) => {
            const row = document.createElement('div');
            row.className = 'theia-mobile-agent-transcript-msg theia-mod-agent';
            row.dataset.qaapStickyFixture = 'true';
            const content = document.createElement('div');
            content.className = 'theia-mobile-agent-transcript-content';
            content.textContent = Array.from({ length: lines }, (_, index) => `${label} line ${index + 1}.`).join('\n');
            row.append(content);
            return row;
        };
        const user = (text, id) => {
            const wrap = document.createElement('div');
            wrap.className = 'theia-mobile-agent-transcript-user-wrap';
            wrap.dataset.messageId = `qaap-sticky-final-fixture-${id}`;
            wrap.dataset.qaapStickyFixture = 'true';
            const row = document.createElement('div');
            row.className = 'theia-mobile-agent-transcript-msg theia-mod-user';
            const content = document.createElement('div');
            content.className = 'theia-mobile-agent-transcript-content';
            content.textContent = text;
            row.append(content);
            wrap.append(row);
            return wrap;
        };

        el.replaceChildren(
            user('Earlier short user prompt.', 'short'),
            agentFiller('Earlier AI response', 20),
            user(longText, 'long-last'),
            agentFiller('Newest AI response that must stay readable', 44),
        );
        el.scrollTop = 0;
    });
    await page.waitForTimeout(300);
}

async function scrollIntoNewestAnswerAfterLastUser(scroller, page) {
    await scroller.evaluate(el => {
        const wraps = [...el.querySelectorAll('.theia-mobile-agent-transcript-user-wrap')];
        const lastWrap = wraps[wraps.length - 1];
        if (!(lastWrap instanceof HTMLElement)) {
            return;
        }
        const scrollerRect = el.getBoundingClientRect();
        const naturalTop = lastWrap.getBoundingClientRect().top - scrollerRect.top + el.scrollTop;
        el.scrollTop = Math.min(el.scrollHeight - el.clientHeight, naturalTop + lastWrap.offsetHeight + 80);
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(500);
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
    await ensureLongUserFixture(scroller, page);

    const userCount = await scroller.locator('.theia-mobile-agent-transcript-user-wrap').count();
    if (userCount < 3) {
        throw new Error(`Expected at least three user messages, found ${userCount}`);
    }

    const samples = [];
    const maxScroll = await scroller.evaluate(el => el.scrollHeight - el.clientHeight);
    const steps = 12;
    await setTranscriptScrollTop(scroller, page, maxScroll);
    for (let step = 0; step <= steps; step++) {
        const top = Math.round(maxScroll - ((maxScroll * step) / steps));
        await setTranscriptScrollTop(scroller, page, top);
        const state = await readStickyState(scroller);
        samples.push({ step, targetTop: top, ...state });
        await page.screenshot({
            path: path.join(OUT_DIR, `step-${String(step).padStart(2, '0')}.png`),
            fullPage: false,
        });
        if (state.stuckCount > 1) {
            throw new Error(`Step ${step}: more than one stuck preview (${state.stuckCount}): ${JSON.stringify(state.stuck)}`);
        }
        if (state.visiblePinnedCount > 1) {
            throw new Error(`Step ${step}: more than one visible pinned user message (${state.visiblePinnedCount})`);
        }
    }

    const handoffSteps = samples.filter(s => s.stuckCount === 1);
    if (userCount > 1 && handoffSteps.length < 2) {
        throw new Error(`Expected sticky handoff across scroll, got ${handoffSteps.length} stuck steps / ${userCount} users`);
    }

    const stuckIndices = [...new Set(handoffSteps.map(s => s.stuck[0]?.index).filter(i => i !== undefined))];
    if (!handoffSteps.some(s => s.stuck[0]?.compact)) {
        throw new Error('Expected at least one stuck long user message to use compact preview');
    }

    const downwardSamples = [];
    await setTranscriptScrollTop(scroller, page, 0);
    for (let step = 0; step <= steps; step++) {
        const top = Math.round((maxScroll * step) / steps);
        await setTranscriptScrollTop(scroller, page, top);
        const state = await readStickyState(scroller);
        downwardSamples.push({ step, targetTop: top, ...state });
        if (state.stuckCount > 1 || state.visiblePinnedCount > 1) {
            throw new Error(`Step ${step}: scrolling down should show at most one sticky user bubble: ${JSON.stringify(state)}`);
        }
    }
    if (!downwardSamples.some(s => s.stuckCount === 1 && s.stuck[0]?.compact)) {
        throw new Error('Expected sticky compact preview while scrolling down before the final user message');
    }

    const jumpStep = handoffSteps.find(s => s.stuck[0]?.compact) ?? handoffSteps[0];
    await setTranscriptScrollTop(scroller, page, maxScroll);
    await setTranscriptScrollTop(scroller, page, jumpStep.targetTop);
    const clickTarget = page.locator('.theia-mobile-agent-transcript-user-wrap.theia-mod-sticky-stuck .theia-mobile-agent-transcript-msg').first();
    if (!(await clickTarget.count())) {
        throw new Error('Expected a stuck chip before tap-to-jump verification');
    }
    const beforeClick = await readStickyState(scroller);
    await clickTarget.click({ force: true });
    await page.waitForTimeout(900);
    const afterClick = await readStickyState(scroller);
    if (beforeClick.stuckCount !== 1 || afterClick.stuckCount !== 0 || afterClick.visiblePinnedCount !== 0 || afterClick.suppressedCount !== 0) {
        throw new Error(`Tap-to-jump did not return to the natural full message: ${JSON.stringify({ beforeClick, afterClick })}`);
    }
    await setTranscriptScrollTop(scroller, page, Math.min(maxScroll, afterClick.scrollTop + 360));
    const afterClickDown = await readStickyState(scroller);
    if (afterClickDown.stuckCount > 1 || afterClickDown.visiblePinnedCount > 1) {
        throw new Error(`Scroll after tap-to-jump should not stack sticky bubbles: ${JSON.stringify(afterClickDown)}`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'after-jump-click.png'), fullPage: false });

    await ensureLastLongUserFixture(scroller, page);
    await scrollIntoNewestAnswerAfterLastUser(scroller, page);
    const latestAnswerState = await readStickyState(scroller);
    if (latestAnswerState.stuckCount !== 0 || latestAnswerState.visiblePinnedCount !== 0) {
        throw new Error(`Final long user prompt should not cover newest AI answer: ${JSON.stringify(latestAnswerState)}`);
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'latest-answer-no-final-user-pin.png'), fullPage: false });

    console.log(JSON.stringify({
        ok: true,
        userCount,
        stuckIndices,
        jump: {
            before: beforeClick.scrollTop,
            after: afterClick.scrollTop,
        },
        samples: samples.map(s => ({
            step: s.step,
            targetTop: s.targetTop,
            stuckCount: s.stuckCount,
            stuckIndex: s.stuck[0]?.index,
            compact: s.stuck[0]?.compact,
        })),
        downwardSamples: downwardSamples.map(s => ({
            step: s.step,
            targetTop: s.targetTop,
            stuckCount: s.stuckCount,
            suppressedCount: s.suppressedCount,
        })),
        screenshots: OUT_DIR,
    }, null, 2));

    await browser.close();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
