// *****************************************************************************
// Copyright (C) 2021 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
// @ts-check
const puppeteer = require('puppeteer');
const fsx = require('fs-extra');
const { resolve } = require('path');
const {
    analyzeTrace, ContributionCollector, delay, frontendSettled, githubReporting,
    isLCP, lcp, measureMulti, parseStopwatchLog
} = require('./common-performance');

const workspacePath = resolve('./workspace');
const profilesPath = './profiles/';

// Baseline wait after the application shell becomes visible, to give Chrome a chance
// to emit one more LCP candidate into the trace before we stop recording.
const LCP_GRACE_MS = 2000;
// Maximum time (including LCP_GRACE_MS) to wait for the frontend-settled console log.
// `armAllSettled()` is called right after state === 'ready', but the log fires only
// once the slowest tracked contribution promise resolves — slow startups need headroom.
const SETTLED_TIMEOUT_MS = 30000;

let name = 'Browser Frontend Startup';
let url = 'http://localhost:3000/#' + workspacePath;
let folder = 'browser';
let headless = true;
let runs = 10;

(async () => {
    let defaultUrl = true;
    const yargs = require('yargs');
    const args = yargs(process.argv.slice(2)).option('name', {
        alias: 'n',
        desc: 'A name for the test suite',
        type: 'string',
        default: name
    }).option('folder', {
        alias: 'f',
        desc: 'Name of a folder within the "profiles" folder in which to collect trace logs',
        type: 'string',
        default: folder
    }).option('runs', {
        alias: 'r',
        desc: 'The number of times to run the test',
        type: 'number',
        default: runs
    }).option('url', {
        alias: 'u',
        desc: 'URL on which to open Theia in the browser (e.g., to specify a workspace)',
        type: 'string',
        default: url
    }).option('headless', {
        desc: 'Run in headless mode (do not open a browser)',
        type: 'boolean',
        default: headless
    }).wrap(Math.min(120, yargs.terminalWidth())).argv;

    if (args.name) {
        name = args.name.toString();
    }
    if (args.url) {
        url = args.url.toString();
        defaultUrl = false;
    }
    if (args.folder) {
        folder = args.folder.toString();
    }
    if (args.runs) {
        runs = parseInt(args.runs.toString());
    }
    if (args.headless !== undefined && args.headless.toString() === 'false') {
        headless = false;
    }
    if (process.env.GITHUB_ACTIONS) {
        githubReporting.enabled = true;
    }

    // Verify that the application exists
    const indexHTML = resolve(__dirname, '../../examples/browser/src-gen/frontend/index.html');
    if (!fsx.existsSync(indexHTML)) {
        console.error('Browser example app does not exist. Please build it before running this script.');
        process.exit(1);
    }

    if (defaultUrl) { fsx.ensureDirSync(workspacePath); }
    fsx.ensureDirSync(profilesPath);
    const folderPath = profilesPath + folder;
    fsx.ensureDirSync(folderPath);

    const deployed = await waitForDeployed(url, 10, 500);
    if (deployed == false) {
        console.error('Could not connect to application.')
    } else {
        await measurePerformance(name, url, folderPath, headless, runs);
    }
})();

async function measurePerformance(name, url, folder, headless, runs) {

    // Collects per-contribution timings from Stopwatch log lines observed in the browser console
    // across all runs, so that consumers like extension-impact.js can break down startup cost
    // by contribution.
    const contributions = new ContributionCollector();

    const testScenario = async (runNr) => {
        const browser = await puppeteer.launch({ headless: headless });
        const page = await browser.newPage();

        const file = folder + '/' + runNr + '.json';

        // Listen for Stopwatch log lines in the browser console and scrape their metrics.
        // A dedicated promise is resolved when the frontend-settled log arrives so that
        // the scenario can proceed as soon as the metric is captured, rather than always
        // waiting the full timeout.
        let settledSeconds;
        let resolveSettled;
        const settledPromise = new Promise(resolve => { resolveSettled = resolve; });
        page.on('console', msg => {
            const parsed = parseStopwatchLog(msg.text());
            if (!parsed) {
                return;
            }
            if (parsed.activity === frontendSettled) {
                settledSeconds = parsed.secondsSinceStart;
                resolveSettled();
            } else if (parsed.activity.startsWith('Frontend ')) {
                contributions.record(parsed.activity, parsed.ms / 1000);
            }
        });

        await page.tracing.start({ path: file, screenshots: true });
        await page.goto(url);
        // This selector is for the theia application, which is exposed when the loading indicator vanishes
        await page.waitForSelector('.theia-ApplicationShell', { visible: true });
        // Give Chrome a chance to emit a final LCP candidate, then wait for the
        // frontend-settled console log (up to SETTLED_TIMEOUT_MS total). If settled already
        // fired during the baseline, the race resolves immediately.
        await delay(LCP_GRACE_MS);
        await Promise.race([settledPromise, delay(SETTLED_TIMEOUT_MS - LCP_GRACE_MS)]);

        await page.tracing.stop();

        await browser.close();

        return { traceFile: file, settledSeconds };
    };

    await measureMulti(name, runs, testScenario, [
        {
            scenario: lcp,
            analyze: ctx => analyzeTrace(ctx.traceFile, isStart, isLCP)
        },
        {
            scenario: frontendSettled,
            analyze: ctx => ctx.settledSeconds
        }
    ]);
    contributions.logSummary(name);
}

function isStart(x) {
    return x.name === 'TracingStartedInBrowser';
}

async function waitForDeployed(url, maxTries, ms) {
    let deployed = true;
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto(url);
    } catch (e) {
        await delay(ms);
        let newTries = maxTries - 1;
        if (newTries > 0) {
            deployed = await waitForDeployed(url, newTries, ms);
        } else {
            browser.close();
            return false;
        }
    }
    browser.close();
    return deployed;
}
