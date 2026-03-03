// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

export interface ShellExecutionInput {
    command: string;
    cwd?: string;
    timeout?: number;
}

/**
 * Parses shell execution input from potentially incomplete JSON.
 * During streaming, extracts partial command value via regex when JSON.parse fails.
 */
export function parseShellExecutionInput(args: string | undefined): ShellExecutionInput {
    if (!args) {
        return { command: '' };
    }

    try {
        return JSON.parse(args);
    } catch {
        // Extract command from incomplete JSON: "command": "value or "command":"value
        const match = /"command"\s*:\s*"([^"]*)"?/.exec(args);
        return { command: match?.[1] ?? '' };
    }
}
