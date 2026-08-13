// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

/**
 * The environment of the processes this integration starts, which are the Copilot CLI of a sign-in
 * and the one that serves the requests.
 */
export namespace CopilotRuntimeEnv {

    /**
     * The variables the Copilot CLI accepts a token from. None of them is a sign-in of this
     * application, so a token this application does not own must not reach the CLI through them.
     */
    export const TOKEN_VARIABLES = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

    /**
     * The given environment without the variables that carry a token.
     *
     * They are dropped by name and regardless of their case, rather than masked with `undefined`.
     * Environment variables are case-insensitive on Windows, so a `Github_Token` of the backend would
     * survive a `GITHUB_TOKEN: undefined` next to it and would still be read by the CLI.
     */
    export function withoutTokens(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
        const dropped = new Set(TOKEN_VARIABLES.map(name => name.toLowerCase()));
        const result: Record<string, string | undefined> = {};
        for (const [name, value] of Object.entries(env)) {
            if (!dropped.has(name.toLowerCase())) {
                result[name] = value;
            }
        }
        return result;
    }
}
