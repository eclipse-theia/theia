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

/**
 * An event in the performance trace (from the Chrome performance API).
 * @typedef TraceEvent
 * @property {string} name the event name
 * @property {number} ts the timestamp, in microseconds since some time after host system start
 */

/**
 * A call-back that selects an event from the performance trace.
 * 
 * @callback EventPredicate
 * @param {TraceEvent} event an event to test
 * @returns {boolean} whether the predicate selects the `event`
 */

/**
 * A call-back that runs the test scenario to be analyzed.
 * 
 * @async
 * @callback TestFunction
 * @param {number} runNr the current run index of the multiple runs being executed
 * @returns {PromiseLike<string>} the path to the recorded performance profiling trace file
 */

const fs = require('fs');
const { resolve } = require('path');

const performanceTag = braceText('Performance');
const lcp = 'Largest Contentful Paint (LCP)';

/**
 * A GitHub performance results record.
 * 
 * @typedef PerformanceResult
 * @property {string} name The performance measurement name
 * @property {string} unit The performance unit of measure
 * @property {number} value The performance measurement
 * @property {number} [range] The standard deviation (the GitHub action calls it a "range") of the measurement
 */

/**
 * Configuration of reporting of performance test results in a GitHub build.
 * 
 * @property {boolean} enabled whether GitHub result reporting is enabled (`false` by default)
 * @property {Array<PerformanceResult>} results the performance results, if reporting is enabled
 */
var githubReporting = { enabled: false, results: [] };

/**
 * Measure the performance of a `test` function implementing some `scenario` of interest.
 * 
 * @param {string} name the application name to measure
 * @param {string} scenario a label for the scenario being measured
 * @param {number} runs the number of times to run the `test` scenario
 * @param {TestFunction} test a function that executes the `scenario` to be measured, returning the file 
 *        that records the performance profile trace
 * @param {EventPredicate} isStartEvent a predicate matching the trace event that marks the start of the measured scenario
 * @param {EventPredicate} isEndEvent a predicate matching the trace event that marks the end of the measured scenario
 */
async function measure(name, scenario, runs, test, isStartEvent, isEndEvent) {
    const durations = [];
    for (let i = 0; i < runs; i++) {
        const runNr = i + 1;

        const file = await test(runNr);
        let time;

        try {
            time = await analyzeTrace(file, isStartEvent, isEndEvent);

            durations.push(time);
            logDuration(name, runNr, scenario, time, runs > 1);
        } catch (e) {
            logException(name, runNr, scenario, e, runs > 1);
        }
    }

    logSummary(name, scenario, durations);
}


/**
 * Log a summary of the given measured `durations`.
 * 
 * @param {string} name the performance script name
 * @param {string} scenario the scenario that was measured
 * @param {number[]} durations the measurements captured for the `scenario`
 */
function logSummary(name, scenario, durations) {
    if (durations.length > 1) {
        const mean = calculateMean(durations);
        const stdev = calculateStandardDeviation(mean, durations);
        logDuration(name, 'MEAN', scenario, mean);
        logDuration(name, 'STDEV', scenario, stdev);
        if (githubReporting.enabled) {
            githubResult({ name, unit: 'seconds', value: prec(mean), range: prec(stdev) });
        }
    } else if (githubReporting.enabled) {
        // Only one duration
        githubResult({ name, unit: 'seconds', value: prec(durations[0]) });
    }
}

function prec(value, precision = 3) {
    return Number.parseFloat(value.toPrecision(precision));
}

/**
 * Report the performance result for GitHub to pick up.
 * 
 * @param {PerformanceResult} result the performance result to report
 */
function githubResult(result) {
    const resultsFile = resolve('../..', 'performance-result.json');

    // We append to any previous results that there may have been from another script
    const previousResults = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf-8')) : [];
    githubReporting.results.push(...previousResults);

    githubReporting.results.push(result);
    fs.writeFileSync(resultsFile, JSON.stringify(githubReporting.results, undefined, 2), 'utf-8');
}

/**
 * Analyze a performance trace file.
 * 
 * @param {string} profilePath the profiling trace file path
 * @param {EventPredicate} isStartEvent a predicate matching the trace event that marks the start of the measured scenario
 * @param {EventPredicate} isEndEvent a predicate matching the trace event that marks the end of the measured scenario
 */
async function analyzeTrace(profilePath, isStartEvent, isEndEvent) {
    let startEvent;
    const tracing = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const endEvents = tracing.traceEvents.filter(e => {
        if (startEvent === undefined && isStartEvent(e)) {
            startEvent = e;
            return false;
        }
        return isEndEvent(e);
    });

    if (startEvent !== undefined && endEvents.length > 0) {
        return duration(endEvents[endEvents.length - 1], startEvent);
    }

    throw new Error('Could not analyze performance trace');
}

/**
 * Query whether a trace `event` is a candidate for the Largest Contentful Paint.
 * 
 * @param {TraceEvent} event an event in the performance trace
 * @returns whether the `event` is an LCP candidate
 */
function isLCP(event) {
    return event.name === 'largestContentfulPaint::Candidate';
}

/**
 * Compute the duration, in seconds, to an `event` from a start event.
 * 
 * @param {TraceEvent} event the duration end event
 * @param {TraceEvent} startEvent the duration start event
 * @returns the duration, in seconds
 */
function duration(event, startEvent) {
    return (event.ts - startEvent.ts) / 1_000_000;
}

/**
 * Log a `duration` measured for some scenario.
 * 
 * @param {string} name the performance script name
 * @param {number|string} run the run index number, or some kind of aggregate like 'Total' or 'Avg'
 * @param {string} metric the scenario that was measured
 * @param {number} duration the duration, in seconds, of the measured scenario
 * @param {boolean} [multipleRuns=true] whether the `run` logged is one of many being logged (default: `true`)
 */
function logDuration(name, run, metric, duration, multipleRuns = true) {
    let runText = '';
    if (multipleRuns) {
        runText = braceText(run);
    }
    console.log(performanceTag + braceText(name) + runText + ' ' + metric + ': ' + duration.toFixed(3) + ' seconds');
}

/**
 * Log an `exception` in measurement of some scenario.
 * 
 * @param {string} name the performance script name
 * @param {number|string} run the run index number, or some kind of aggregate like 'Total' or 'Avg'
 * @param {string} metric the scenario that was measured
 * @param {Error} exception the duration, in seconds, of the measured scenario
 * @param {boolean} [multipleRuns=true] whether the `run` logged is one of many being logged (default: `true`)
 */
function logException(name, run, metric, exception, multipleRuns = true) {
    let runText = '';
    if (multipleRuns) {
        runText = braceText(run);
    }
    console.log(performanceTag + braceText(name) + runText + ' ' + metric + ' failed to obtain a measurement: ' + exception.message);
    console.error(`Failed to obtain a measurement. The most likely cause is that the performance trace file was incomplete because the script did not wait long enough for "${metric}".`);
    console.error(exception);
}

/**
 * Compute the arithmetic mean of an `array` of numbers.
 * 
 * @param {number[]} array an array of numbers to average
 * @returns the average of the `array`
 */
function calculateMean(array) {
    let sum = 0;
    array.forEach(x => {
        sum += x;
    });
    return (sum / array.length);
};

/**
 * Compute the standard deviation from the mean of an `array` of numbers.
 * 
 * @param {number[]} array an array of numbers
 * @returns the standard deviation of the `array` from its mean
 */
function calculateStandardDeviation(mean, array) {
    let sumOfDiffsSquared = 0;
    array.forEach(time => {
        sumOfDiffsSquared += Math.pow((time - mean), 2)
    });
    const variance = sumOfDiffsSquared / array.length;
    return Math.sqrt(variance);
}

/**
 * Surround a string of `text` in square braces.
 * 
 * @param {string|number} text a string of text or a number that can be rendered as text
 * @returns the `text` in braces
 */
function braceText(text) {
    return '[' + text + ']';
}

/**
 * Obtain a promise that resolves after some delay.
 * 
 * @param {number} time a delay, in milliseconds
 * @returns a promise that will resolve after the given number of milliseconds
 */
function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

module.exports = {
    githubReporting,
    measure, analyzeTrace,
    calculateMean, calculateStandardDeviation,
    duration, logDuration, logSummary,
    braceText, delay,
    lcp, isLCP
};
