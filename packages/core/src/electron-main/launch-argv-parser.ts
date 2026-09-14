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

import { LaunchArguments } from '../common/launch-arguments';

/**
 * Parses the `argv` of a forwarded launch into {@link LaunchArguments}.
 *
 * This lives in the Electron main process on purpose: the command line is parsed once, here, and
 * every consumer (main-process contributions and the window the launch opened) works with the
 * parsed result. No argument grammar is shipped to the renderer.
 *
 * The grammar mirrors what yargs accepts on cold start for the same flags: a value given as either
 * `--name value` or `--name=value`, options repeatable to yield multiple values, a token that
 * itself looks like an option (starts with `-`) never consumed as a value, and `--no-name` /
 * `--name=false` recognised as an explicit negation.
 */
export namespace LaunchArgvParser {

    export function parse(argv: readonly string[]): LaunchArguments {
        const values: Record<string, string[]> = {};
        const negated: string[] = [];
        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            if (!token.startsWith('--')) {
                continue;
            }
            const name = token.substring(2);
            const equalsIndex = name.indexOf('=');
            if (equalsIndex >= 0) {
                const key = name.substring(0, equalsIndex);
                const value = name.substring(equalsIndex + 1);
                if (value === 'false') {
                    negated.push(key);
                } else {
                    (values[key] ??= []).push(value);
                }
            } else if (name.startsWith('no-')) {
                negated.push(name.substring('no-'.length));
            } else {
                const next = argv[i + 1];
                // Like yargs, do not consume a following option-looking token (`-x`/`--x`) as the value.
                if (next !== undefined && !next.startsWith('-')) {
                    (values[name] ??= []).push(next);
                    i++;
                }
            }
        }
        return { values, negated };
    }
}
