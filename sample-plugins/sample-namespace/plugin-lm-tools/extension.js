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

const vscode = require('vscode');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function activate(context) {
    console.log('[plugin-lm-tools] Activating...');

    // Tool 1: Get Current Time (no input parameters)
    const timeTool = vscode.lm.registerTool('sample-getCurrentTime', {
        invoke(_options, _token) {
            const now = new Date().toISOString();
            console.log('[plugin-lm-tools] sample-getCurrentTime invoked, returning:', now);
            return { content: [new vscode.LanguageModelTextPart(now)] };
        },
        prepareInvocation(_options, _token) {
            return {
                invocationMessage: 'Getting current time...'
            };
        }
    });
    context.subscriptions.push(timeTool);

    // Tool 2: Calculate Sum (takes an array of numbers, demonstrates cancellation)
    const sumTool = vscode.lm.registerTool('sample-calculateSum', {
        async invoke(options, token) {
            const input = options.input;
            const numbers = input.numbers;
            if (!Array.isArray(numbers)) {
                throw new Error('Expected "numbers" to be an array.');
            }
            // Simulate a long-running operation that respects cancellation
            let sum = 0;
            for (const n of numbers) {
                if (token.isCancellationRequested) {
                    throw new Error('Tool invocation was cancelled.');
                }
                sum += n;
                // Delay for 2 seconds per number in the input
                await delay(2000);
            }
            const result = `The sum of [${numbers.join(', ')}] is ${sum}.`;
            console.log('[plugin-lm-tools] sample-calculateSum invoked:', result);
            return { content: [new vscode.LanguageModelTextPart(result)] };
        },
        prepareInvocation(options, _token) {
            const numbers = options.input.numbers;
            return {
                invocationMessage: `Calculating sum of ${Array.isArray(numbers) ? numbers.length : '?'} numbers...`
            };
        }
    });
    context.subscriptions.push(sumTool);

    // Tool 3: Get System Info (returns mixed content parts)
    const infoTool = vscode.lm.registerTool('sample-getSystemInfo', {
        invoke(_options, _token) {
            const textPart = new vscode.LanguageModelTextPart('System information:');
            const jsonPart = vscode.LanguageModelDataPart.json({
                platform: process.platform,
                nodeVersion: process.version,
                uptime: process.uptime()
            });
            return { content: [textPart, jsonPart] };
        }
    });
    context.subscriptions.push(infoTool);

    console.log('[plugin-lm-tools] Registered 3 tools: sample-getCurrentTime, sample-calculateSum, sample-getSystemInfo');
}

function deactivate() {
    console.log('[plugin-lm-tools] Deactivated.');
}

module.exports = { activate, deactivate };
