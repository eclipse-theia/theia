/********************************************************************************
 * Copyright (C) 2021 STMicroelectronics and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
// @ts-check
const puppeteer = require('puppeteer');
const fs = require('fs');
const fsExtra = require('fs-extra');
const resolve = require('path').resolve;
const workspacePath = resolve('./workspace');
const profilesPath = './profiles/';

const lcp = 'Largest Contentful Paint (LCP)';
const performanceTag = braceText('Performance');

let name = 'StartupPerformance';
let url = 'http://localhost:3000/#' + workspacePath;
let folder = 'profile';
let headless = true;
let runs = 10;

(async () => {
    let defaultUrl = true;

    const args = require('yargs/yargs')(process.argv.slice(2)).argv;
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
    if (args.headless) {
        if (args.headless.toString() === 'false') {
            headless = false;
        }
    }

    if (defaultUrl) { fsExtra.ensureDirSync(workspacePath); }
    fsExtra.ensureDirSync(profilesPath);
    const folderPath = profilesPath + folder;
    fsExtra.ensureDirSync(folderPath);

    const deployed = await waitForDeployed(url, 10, 500);
    if (deployed == false) {
        console.error('Could not connect to application.')
    } else {
        await measurePerformance(name, url, folderPath, headless, runs);
    }
})();

async function measurePerformance(name, url, folder, headless, runs) {
    const durations = [];
    for (let i = 0; i < runs; i++) {
        const runNr = i + 1;
        const browser = await puppeteer.launch({ headless: headless });
        const page = await browser.newPage();

        const file = folder + '/' + runNr + '.json';
        await page.tracing.start({ path: file, screenshots: true });
        await page.goto(url);
        // This selector is for the theia application, which is exposed when the loading indicator vanishes
        await page.waitForSelector('.theia-ApplicationShell', { visible: true });
        // Prevent tracing from stopping too soon and skipping a LCP candidate
        await delay(1000);

        await page.tracing.stop();

        await browser.close();

        const time = await analyzeStartup(file)
        durations.push(time);
        logDuration(name, runNr, lcp, time.toFixed(3), runs > 1);
    }

    if (runs > 1) {
        const mean = calculateMean(durations);
        logDuration(name, 'MEAN', lcp, mean);
        logDuration(name, 'STDEV', lcp, calculateStandardDeviation(mean, durations));
    }
}

async function analyzeStartup(profilePath) {
    let startEvent;
    const tracing = JSON.parse(fs.readFileSync('./' + profilePath, 'utf8'));
    const lcpEvents = tracing.traceEvents.filter(x => {
        if (isStart(x)) {
            startEvent = x;
            return false;
        }
        return isLCP(x);
    });

    if (startEvent !== undefined) {
        return duration(lcpEvents[lcpEvents.length - 1], startEvent);
    }
    throw new Error('Could not analyze startup');
}

function isLCP(x) {
    return x.name === 'largestContentfulPaint::Candidate';
}

function isStart(x) {
    return x.name === 'TracingStartedInBrowser';
}

function duration(event, startEvent) {
    return (event.ts - startEvent.ts) / 1000000;
}

function logDuration(name, run, metric, duration, multipleRuns = true) {
    let runText = '';
    if (multipleRuns) {
        runText = braceText(run);
    }
    console.log(performanceTag + braceText(name) + runText + ' ' + metric + ': ' + duration + ' seconds');
}

function calculateMean(array) {
    let sum = 0;
    array.forEach(x => {
        sum += x;
    });
    return (sum / array.length).toFixed(3);
};

function calculateStandardDeviation(mean, array) {
    let sumOfDiffsSquared = 0;
    array.forEach(time => {
        sumOfDiffsSquared += Math.pow((time - mean), 2)
    });
    const variance = sumOfDiffsSquared / array.length;
    return Math.sqrt(variance).toFixed(3);
}

function braceText(text) {
    return '[' + text + ']';
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
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
