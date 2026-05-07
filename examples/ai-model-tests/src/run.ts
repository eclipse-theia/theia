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

import { chromium, Browser, Page } from 'playwright';
import { loadConfig } from './config';
import { loadScenarios, Scenario } from './scenario-loader';
import { writeReport, Report, ScenarioResult, SingleResult, Evaluation } from './report-writer';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const THEIA_URL = process.env.THEIA_URL || 'http://localhost:3000';
const THEIA_LOAD_TIMEOUT = 60_000;

interface SerializedResponse {
    content: Array<{ kind: string; data: unknown }>;
    isComplete: boolean;
    isError: boolean;
    tokenUsage?: { inputTokens: number; outputTokens: number };
}

interface SerializedConversation {
    sessionId: string;
    requests: Array<{ id: string; text: string; agentId?: string }>;
    responses: SerializedResponse[];
}

interface ParsedArgs {
    scenario?: string;
    skipEval: boolean;
    headed: boolean;
    keepOpen: boolean;
}

function printHelp(): void {
    console.log(`Usage: npx tsx src/run.ts [options]

Options:
  -s, --scenario <id>   Run only the scenario with this ID
  -e, --skip-eval       Skip judge evaluation (just capture agent responses)
  -h, --headed          Show the browser window
  -k, --keep-open       Keep browser open after tests for inspection
      --help            Show this help message

Models and repeat runs are configured in the scenario frontmatter.
See README.md for details.
`);
}

function parseArgs(): ParsedArgs {
    const args = process.argv.slice(2);
    let scenario: string | undefined;
    let skipEval = false;
    let headed = false;
    let keepOpen = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help') {
            printHelp();
            process.exit(0);
        } else if ((args[i] === '-s' || args[i] === '--scenario') && args[i + 1]) {
            scenario = args[++i];
        } else if (args[i] === '-e' || args[i] === '--skip-eval') {
            skipEval = true;
        } else if (args[i] === '-h' || args[i] === '--headed') {
            headed = true;
        } else if (args[i] === '-k' || args[i] === '--keep-open') {
            keepOpen = true;
        }
    }

    return { scenario, skipEval, headed, keepOpen };
}

async function waitForTheia(page: Page): Promise<void> {
    await page.waitForSelector('.theia-ApplicationShell', { timeout: THEIA_LOAD_TIMEOUT });
    await page.waitForTimeout(3000);
}

async function waitForTestBridge(page: Page): Promise<void> {
    await page.waitForFunction(
        () => (window as unknown as Record<string, unknown>).__theiaTestBridge !== undefined,
        { timeout: THEIA_LOAD_TIMEOUT }
    );
}

async function callBridge<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
    return page.evaluate(
        ({ m, a }) => {
            const bridge = (window as unknown as Record<string, unknown>).__theiaTestBridge as Record<string, (...params: unknown[]) => unknown>;
            return bridge[m](...a);
        },
        { m: method, a: args }
    ) as Promise<T>;
}

function extractResponseText(conversation: SerializedConversation): string {
    const parts: string[] = [];
    for (const response of conversation.responses) {
        for (const content of response.content) {
            if (content.kind === 'text' || content.kind === 'markdownContent') {
                const data = content.data as { content?: string };
                if (data.content) {
                    parts.push(data.content);
                }
            } else if (content.kind === 'code') {
                const data = content.data as { code?: string; language?: string };
                if (data.code) {
                    parts.push(`\`\`\`${data.language || ''}\n${data.code}\n\`\`\``);
                }
            }
        }
    }
    return parts.join('\n');
}

function extractToolCalls(conversation: SerializedConversation): Array<{ name: string; arguments: string; result?: string }> {
    const toolCalls: Array<{ name: string; arguments: string; result?: string }> = [];
    for (const response of conversation.responses) {
        for (const content of response.content) {
            if (content.kind === 'toolCall') {
                const data = content.data as { name?: string; arguments?: string; result?: unknown };
                toolCalls.push({
                    name: data.name || 'unknown',
                    arguments: data.arguments || '',
                    result: data.result ? JSON.stringify(data.result).substring(0, 500) : undefined,
                });
            }
        }
    }
    return toolCalls;
}

function getTokenUsage(conversation: SerializedConversation): { input: number; output: number } {
    let input = 0;
    let output = 0;
    for (const response of conversation.responses) {
        if (response.tokenUsage) {
            input += response.tokenUsage.inputTokens || 0;
            output += response.tokenUsage.outputTokens || 0;
        }
    }
    return { input, output };
}

const DEFAULT_PROVIDERS = ['anthropic', 'openai', 'google'];

function getDefaultModels(registeredModels: string[]): string[] {
    return registeredModels.filter(m => DEFAULT_PROVIDERS.some(p => m.startsWith(`${p}/`)));
}

function getModelsForScenario(scenario: Scenario, defaultModels: string[]): string[] {
    if (scenario.models.length > 0) {
        return scenario.models;
    }
    return defaultModels;
}

async function evaluateViaJudge(
    page: Page,
    prompt: string,
    expectedBehavior: string,
    response: string,
    evaluationDir: string,
): Promise<Evaluation> {
    const templatePath = path.join(evaluationDir, 'judge-quality.md');
    const template = fs.readFileSync(templatePath, 'utf-8');

    const judgePrompt = template
        .replace('{{prompt}}', prompt)
        .replace('{{expected_behavior}}', expectedBehavior)
        .replace('{{response}}', response);

    const sessionId = await callBridge<string>(page, 'createSession', 'Judge');
    const conversation = await callBridge<SerializedConversation>(
        page, 'sendMessage', sessionId, judgePrompt
    );

    const judgeResponse = extractResponseText(conversation);
    return parseEvaluation(judgeResponse);
}

function parseEvaluation(responseText: string): Evaluation {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return {
            score: 0, pass: false,
            reasoning: `Could not parse judge response: ${responseText.substring(0, 200)}`,
            issues: ['Invalid judge response format'],
        };
    }
    try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            score: typeof parsed.score === 'number' ? parsed.score : 0,
            pass: typeof parsed.pass === 'boolean' ? parsed.pass : parsed.score >= 6,
            reasoning: parsed.reasoning || '',
            issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        };
    } catch {
        return {
            score: 0, pass: false,
            reasoning: `Failed to parse JSON: ${responseText.substring(0, 200)}`,
            issues: ['JSON parse error'],
        };
    }
}

function saveConversations(conversations: unknown[], resultsDir: string, prefix: string): string {
    fs.mkdirSync(resultsDir, { recursive: true });
    const filePath = path.join(resultsDir, `${prefix}_conversations.json`);
    fs.writeFileSync(filePath, JSON.stringify(conversations, undefined, 2));
    return filePath;
}

/**
 * Get the git repo root directory.
 */
function getRepoRoot(): string {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
}

/**
 * Capture the git diff of file changes the agent made, save it to a patch file,
 * then reset the workspace for the next run.
 * All git commands run against the repo root, not the cwd.
 */
function captureAndResetWorkspace(resultsDir: string, prefix: string, modelId: string, run: number): string | undefined {
    const repoRoot = getRepoRoot();
    const gitOpts = { encoding: 'utf-8' as const, cwd: repoRoot };

    try {
        // Capture both staged and unstaged changes, plus untracked files
        const diff = execSync('git diff HEAD', gitOpts);
        const untrackedFiles = execSync('git ls-files --others --exclude-standard', gitOpts).trim();

        if (!diff && !untrackedFiles) {
            return undefined;
        }

        fs.mkdirSync(resultsDir, { recursive: true });
        const safeName = modelId.replace(/\//g, '-');
        const patchFile = path.join(resultsDir, `${prefix}_${safeName}_run${run}.patch`);

        let patchContent = '';
        if (diff) {
            patchContent += diff;
        }
        if (untrackedFiles) {
            for (const file of untrackedFiles.split('\n').filter(Boolean)) {
                try {
                    const content = fs.readFileSync(path.join(repoRoot, file), 'utf-8');
                    patchContent += `\n--- /dev/null\n+++ b/${file}\n`;
                    patchContent += content.split('\n').map(line => `+${line}`).join('\n');
                    patchContent += '\n';
                } catch {
                    // skip binary or unreadable files
                }
            }
        }

        if (patchContent) {
            fs.writeFileSync(patchFile, patchContent);
        }

        // Reset: discard all tracked changes and remove untracked files
        execSync('git checkout .', gitOpts);
        execSync('git clean -fd', gitOpts);

        return patchFile;
    } catch {
        // Fallback: try basic reset
        try {
            execSync('git checkout .', { encoding: 'utf-8', cwd: repoRoot });
            execSync('git clean -fd', { encoding: 'utf-8', cwd: repoRoot });
        } catch {
            // give up
        }
        return undefined;
    }
}

async function main(): Promise<void> {
    const config = loadConfig();
    const { scenario: scenarioFilter, skipEval, headed, keepOpen } = parseArgs();

    console.log('=== AI Model Test Harness ===\n');
    console.log(`Theia URL: ${THEIA_URL}?test-bridge`);
    if (headed) {
        console.log('Headed mode: browser visible');
    }
    if (keepOpen) {
        console.log('Keep-open mode: browser stays open after tests');
    }
    if (skipEval) {
        console.log('Evaluation skipped (--skip-eval)');
    }
    console.log('');

    const scenarios = loadScenarios(config.scenariosDir, scenarioFilter);

    if (scenarios.length === 0) {
        console.error('No matching scenarios found.');
        process.exit(1);
    }

    const browser: Browser = await chromium.launch({ headless: !headed });
    const page = await browser.newPage();

    console.log('Connecting to Theia...');
    await page.goto(`${THEIA_URL}?test-bridge`);
    await waitForTheia(page);
    await waitForTestBridge(page);
    console.log('Theia ready. Test bridge active.\n');

    const agents = await callBridge<Array<{ id: string; name: string }>>(page, 'getAgents');
    console.log(`Available agents: ${agents.map(a => a.id).join(', ')}`);

    const registeredModels = await callBridge<string[]>(page, 'getModels');
    const defaultModels = getDefaultModels(registeredModels);
    console.log(`Default models: ${defaultModels.join(', ')}\n`);

    const report: Report = {
        timestamp: new Date().toISOString(),
        scenarios: [],
    };

    // Build prefix early for patch file naming
    const timestamp = report.timestamp.replace(/[:.]/g, '-');

    for (const scenario of scenarios) {
        console.log(`=== Scenario: ${scenario.id} ===`);
        console.log(`  ${scenario.description}`);
        if (scenario.agent) {
            console.log(`  Agent: ${scenario.agent}`);
        }
        if (scenario.runs > 1) {
            console.log(`  Runs per model: ${scenario.runs}`);
        }
        console.log('');

        const modelRuns = getModelsForScenario(scenario, defaultModels);

        const scenarioResult: ScenarioResult = {
            scenarioId: scenario.id,
            description: scenario.description,
            results: [],
        };

        for (const modelId of modelRuns) {
            const agentId = scenario.agent || 'Coder';

            for (let run = 1; run <= scenario.runs; run++) {
                const runLabel = scenario.runs > 1 ? ` (run ${run}/${scenario.runs})` : '';
                const label = `${modelId}${runLabel}`;

                // Set the model for this agent via agentSettings preference
                process.stdout.write(`  [${label}] Setting model for ${agentId}... `);
                await callBridge(page, 'setAgentModel', agentId, modelId);
                console.log('done');

                process.stdout.write(`  [${label}] Running via ${agentId} agent... `);

                try {
                    const sessionId = await callBridge<string>(page, 'createSession', agentId);

                    const start = Date.now();
                    const conversation = await callBridge<SerializedConversation>(
                        page, 'sendMessage', sessionId, scenario.prompt
                    );
                    const latencyMs = Date.now() - start;

                    const responseText = extractResponseText(conversation);
                    const toolCalls = extractToolCalls(conversation);
                    const tokenUsage = getTokenUsage(conversation);

                    console.log(`done (${(latencyMs / 1000).toFixed(1)}s, ${toolCalls.length} tool calls)`);

                    const singleResult: SingleResult = {
                        modelId,
                        run: scenario.runs > 1 ? run : undefined,
                        modelResult: { modelId, responseText, latencyMs, tokenUsage },
                        toolCalls,
                        conversation: conversation as unknown as Record<string, unknown>,
                    };

                    if (!skipEval) {
                        process.stdout.write(`  [${label}] Evaluating via Judge agent... `);

                        const enrichedResponse = [
                            responseText,
                            '',
                            `## Tool Calls (${toolCalls.length} total)`,
                            ...toolCalls.map((tc, i) => `${i + 1}. ${tc.name}(${tc.arguments.substring(0, 100)})`),
                        ].join('\n');

                        const evaluation = await evaluateViaJudge(
                            page, scenario.prompt, scenario.expectedBehavior,
                            enrichedResponse, config.evaluationDir,
                        );
                        singleResult.evaluation = evaluation;
                        const passLabel = evaluation.pass ? 'PASS' : 'FAIL';
                        console.log(`${evaluation.score}/10 (${passLabel})`);
                    }

                    scenarioResult.results.push(singleResult);
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.log(`ERROR: ${message}`);
                    scenarioResult.results.push({
                        modelId,
                        run: scenario.runs > 1 ? run : undefined,
                        modelResult: {
                            modelId, responseText: '', latencyMs: 0,
                            tokenUsage: { input: 0, output: 0 }, error: message,
                        },
                    });
                }

                // Save file changes as a patch, then reset workspace
                const patchFile = captureAndResetWorkspace(config.resultsDir, `${timestamp}_${scenario.id}`, modelId, run);
                if (patchFile) {
                    console.log(`  [${label}] File changes saved to: ${path.basename(patchFile)}`);
                    console.log(`  [${label}] Workspace reset`);
                }

                console.log('');
            }
        }

        report.scenarios.push(scenarioResult);
    }

    const scenarioNames = report.scenarios.map(s => s.scenarioId).join('+');
    const prefix = `${timestamp}_${scenarioNames}`;

    // Save all conversations as JSON for later inspection
    const allConversations = await callBridge<unknown[]>(page, 'getAllConversations');
    const conversationsPath = saveConversations(allConversations, config.resultsDir, prefix);
    console.log(`Conversations saved to: ${conversationsPath}`);

    const reportPath = writeReport(report, config.resultsDir);
    console.log(`Report written to: ${reportPath}`);

    if (keepOpen) {
        console.log('\nBrowser left open for inspection. Press Ctrl+C to exit.');
        await new Promise(() => { });
    } else {
        await browser.close();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
