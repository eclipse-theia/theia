// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as fs from 'fs';
import * as path from 'path';

export interface ModelResult {
    modelId: string;
    responseText: string;
    latencyMs: number;
    tokenUsage: { input: number; output: number };
    error?: string;
}

export interface Evaluation {
    score: number;
    pass: boolean;
    reasoning: string;
    issues: string[];
}

export interface ScenarioResult {
    scenarioId: string;
    description: string;
    results: SingleResult[];
}

export interface SingleResult {
    modelId: string;
    run?: number;
    modelResult: ModelResult;
    evaluation?: Evaluation;
    toolCalls?: Array<{ name: string; arguments: string; result?: string }>;
    conversation?: Record<string, unknown>;
}

export interface Report {
    timestamp: string;
    scenarios: ScenarioResult[];
}

export function writeReport(report: Report, resultsDir: string): string {
    fs.mkdirSync(resultsDir, { recursive: true });

    const timestamp = report.timestamp.replace(/[:.]/g, '-');
    const scenarioNames = report.scenarios.map(s => s.scenarioId).join('+');
    const prefix = `${timestamp}_${scenarioNames}`;

    // Write JSON
    const jsonPath = path.join(resultsDir, `${prefix}_results.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, undefined, 2));

    // Write Markdown
    const mdPath = path.join(resultsDir, `${prefix}_report.md`);
    fs.writeFileSync(mdPath, generateMarkdown(report));

    return mdPath;
}

function generateMarkdown(report: Report): string {
    const lines: string[] = [];
    lines.push('# AI Model Test Report');
    lines.push('**Date:** ${report.timestamp}\n');

    const hasRuns = report.scenarios.some(s => s.results.some(r => r.run !== undefined));

    // Summary table (one row per model, averages if multiple runs)
    lines.push('## Summary\n');
    lines.push('| Scenario | Model | Score | Pass | Latency | Tokens (in/out) | Tool Calls | Issues |');
    lines.push('|----------|-------|-------|------|---------|-----------------|------------|--------|');

    for (const scenario of report.scenarios) {
        const modelGroups = groupByModel(scenario.results);
        for (const [modelId, results] of Object.entries(modelGroups)) {
            if (results.length > 1) {
                const avg = computeAverages(results);
                lines.push(`| ${scenario.scenarioId} | ${modelId} | ${avg.score} | ${avg.passRate} | ${avg.latency} | ${avg.tokens} | ${avg.toolCalls} | ${avg.runs} runs |`);
            } else {
                const result = results[0];
                const score = result.evaluation ? `${result.evaluation.score}/10` : 'N/A';
                const pass = result.modelResult.error ? 'ERROR'
                    : result.evaluation ? (result.evaluation.pass ? 'yes' : 'no')
                        : 'N/A';
                const latency = `${(result.modelResult.latencyMs / 1000).toFixed(1)}s`;
                const tokens = result.modelResult.error ? '-'
                    : `${result.modelResult.tokenUsage.input}/${result.modelResult.tokenUsage.output}`;
                const toolCallCount = result.toolCalls ? String(result.toolCalls.length) : '-';
                const issues = result.modelResult.error
                    ? result.modelResult.error.substring(0, 50)
                    : result.evaluation?.issues?.join(', ') || '-';
                lines.push(`| ${scenario.scenarioId} | ${modelId} | ${score} | ${pass} | ${latency} | ${tokens} | ${toolCallCount} | ${issues} |`);
            }
        }
    }

    // Per-run detail table (only when runs > 1)
    if (hasRuns) {
        lines.push('\n## Per-Run Details\n');
        lines.push('| Scenario | Model | Run | Score | Pass | Latency | Tokens (in/out) | Tool Calls |');
        lines.push('|----------|-------|-----|-------|------|---------|-----------------|------------|');

        for (const scenario of report.scenarios) {
            for (const result of scenario.results) {
                if (result.run === undefined) {
                    continue;
                }
                const score = result.evaluation ? `${result.evaluation.score}/10` : 'N/A';
                const pass = result.modelResult.error ? 'ERROR'
                    : result.evaluation ? (result.evaluation.pass ? 'yes' : 'no')
                        : 'N/A';
                const latency = `${(result.modelResult.latencyMs / 1000).toFixed(1)}s`;
                const tokens = result.modelResult.error ? '-'
                    : `${result.modelResult.tokenUsage.input}/${result.modelResult.tokenUsage.output}`;
                const toolCallCount = result.toolCalls ? String(result.toolCalls.length) : '-';
                lines.push(`| ${scenario.scenarioId} | ${result.modelId} | ${result.run} | ${score} | ${pass} | ${latency} | ${tokens} | ${toolCallCount} |`);
            }
        }
    }

    // Details per scenario
    for (const scenario of report.scenarios) {
        lines.push(`\n## ${scenario.scenarioId}\n`);
        lines.push(`> ${scenario.description}\n`);

        for (const result of scenario.results) {
            const runSuffix = result.run !== undefined ? ` (run ${result.run})` : '';
            lines.push(`### ${result.modelId}${runSuffix}\n`);

            if (result.modelResult.error) {
                lines.push(`**Error:** ${result.modelResult.error}\n`);
                continue;
            }

            lines.push(`- **Latency:** ${(result.modelResult.latencyMs / 1000).toFixed(1)}s`);
            lines.push(`- **Tokens:** ${result.modelResult.tokenUsage.input} in / ${result.modelResult.tokenUsage.output} out`);

            if (result.toolCalls && result.toolCalls.length > 0) {
                lines.push(`- **Tool Calls:** ${result.toolCalls.length}`);
                for (const tc of result.toolCalls) {
                    lines.push(`  - \`${tc.name}\``);
                }
            }

            if (result.evaluation) {
                lines.push(`- **Score:** ${result.evaluation.score}/10 (${result.evaluation.pass ? 'PASS' : 'FAIL'})`);
                lines.push(`- **Reasoning:** ${result.evaluation.reasoning}`);
                if (result.evaluation.issues.length > 0) {
                    lines.push(`- **Issues:** ${result.evaluation.issues.join(', ')}`);
                }
            }

            lines.push('\n<details><summary>Full Response</summary>\n');
            lines.push('```');
            lines.push(result.modelResult.responseText.substring(0, 2000));
            if (result.modelResult.responseText.length > 2000) {
                lines.push('... (truncated)');
            }
            lines.push('```');
            lines.push('</details>\n');
        }
    }

    return lines.join('\n');
}

function groupByModel(results: SingleResult[]): Record<string, SingleResult[]> {
    const groups: Record<string, SingleResult[]> = {};
    for (const r of results) {
        if (!groups[r.modelId]) {
            groups[r.modelId] = [];
        }
        groups[r.modelId].push(r);
    }
    return groups;
}

function computeAverages(results: SingleResult[]): {
    score: string; passRate: string; latency: string; tokens: string; toolCalls: string; runs: number;
} {
    const evaluated = results.filter(r => r.evaluation);
    const successful = results.filter(r => !r.modelResult.error);

    const avgScore = evaluated.length > 0
        ? (evaluated.reduce((sum, r) => sum + (r.evaluation?.score || 0), 0) / evaluated.length).toFixed(1) + '/10'
        : 'N/A';

    const passCount = evaluated.filter(r => r.evaluation?.pass).length;
    const passRate = evaluated.length > 0
        ? `${Math.round(passCount / evaluated.length * 100)}%`
        : 'N/A';

    const avgLatency = successful.length > 0
        ? (successful.reduce((sum, r) => sum + r.modelResult.latencyMs, 0) / successful.length / 1000).toFixed(1) + 's'
        : '-';

    const avgTokensIn = successful.length > 0
        ? Math.round(successful.reduce((sum, r) => sum + r.modelResult.tokenUsage.input, 0) / successful.length)
        : 0;
    const avgTokensOut = successful.length > 0
        ? Math.round(successful.reduce((sum, r) => sum + r.modelResult.tokenUsage.output, 0) / successful.length)
        : 0;
    const tokens = successful.length > 0 ? `${avgTokensIn}/${avgTokensOut}` : '-';

    const withToolCalls = successful.filter(r => r.toolCalls);
    const avgToolCalls = withToolCalls.length > 0
        ? (withToolCalls.reduce((sum, r) => sum + (r.toolCalls?.length || 0), 0) / withToolCalls.length).toFixed(1)
        : '-';

    return { score: avgScore, passRate, latency: avgLatency, tokens, toolCalls: avgToolCalls, runs: results.length };
}
