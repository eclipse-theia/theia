// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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
const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_FILE = path.join(os.tmpdir(), 'theia-telemetry-probe.log');

function append(kind, payload) {
    fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), kind, ...payload }) + '\n');
}

exports.activate = function (context) {
    append('run', { logFile: LOG_FILE, isTelemetryEnabled: vscode.env.isTelemetryEnabled });

    // Only events that survive the consent gate ever reach this sender.
    const logger = vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            append('delivered-usage', { eventName, data });
        },
        sendErrorData(error, data) {
            append('delivered-error', { error: String(error && error.message || error), data });
        },
        flush() {
            append('flush', {});
        }
    });
    context.subscriptions.push(logger);

    const state = where => append('state', {
        where,
        isTelemetryEnabled: vscode.env.isTelemetryEnabled,
        isUsageEnabled: logger.isUsageEnabled,
        isErrorsEnabled: logger.isErrorsEnabled
    });

    state('activate');

    // Both calls run inside activate(), before a consent level pushed over RPC could arrive.
    logger.logUsage('probe/activation-usage', { source: 'activate' });
    logger.logError(new Error('probe/activation-error'), { source: 'activate' });

    context.subscriptions.push(vscode.env.onDidChangeTelemetryEnabled(() => state('onDidChangeTelemetryEnabled')));
    context.subscriptions.push(logger.onDidChangeEnableStates(() => state('onDidChangeEnableStates')));

    context.subscriptions.push(vscode.commands.registerCommand('plugin-telemetry-probe.log', () => {
        state('command');
        logger.logUsage('probe/on-demand-usage', { source: 'command' });
        logger.logError(new Error('probe/on-demand-error'), { source: 'command' });
        vscode.window.showInformationMessage(`Telemetry probe logged to ${LOG_FILE}`);
    }));
};

exports.deactivate = function () { };
