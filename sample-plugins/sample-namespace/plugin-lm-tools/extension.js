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

    // Tool 2: Calculate Sum (takes an array of numbers)
    const sumTool = vscode.lm.registerTool('sample-calculateSum', {
        invoke(options, _token) {
            const input = options.input;
            const numbers = input.numbers;
            if (!Array.isArray(numbers)) {
                throw new Error('Expected "numbers" to be an array.');
            }
            const sum = numbers.reduce((acc, n) => acc + n, 0);
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

    console.log('[plugin-lm-tools] Registered 2 tools: sample-getCurrentTime, sample-calculateSum');
}

function deactivate() {
    console.log('[plugin-lm-tools] Deactivated.');
}

module.exports = { activate, deactivate };
