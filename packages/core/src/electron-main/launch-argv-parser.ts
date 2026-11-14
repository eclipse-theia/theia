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

import type { Arguments, Argv } from '../../shared/yargs/index.cjs';
import { Parser } from 'yargs/helpers';
import createYargs from 'yargs/yargs';
import { LaunchArguments } from '../common/launch-arguments.js';

function aliasOf(name: string, convert: (part: string) => string): string {
    return name.split('.').map(part => convert(part)).join('.');
}

/**
 * Projects the Electron main process's yargs result into the per-window {@link LaunchArguments}.
 *
 * @experimental
 */
export namespace LaunchArgvParser {

    /** Bind the name of a boolean CLI option in Electron main so yargs leaves the following workspace positional. */
    export const BooleanOption = Symbol('LaunchArgvParser.BooleanOption');

    export function command(argv: readonly string[], cwd: string, booleanOptions: readonly string[] = []): Argv {
        return createYargs(argv, cwd).help(false).boolean(booleanOptions).parserConfiguration({
            // Forward extension values verbatim, including numeric-looking IDs and dotted option names.
            'parse-numbers': false,
            'dot-notation': false
        });
    }

    export function parse(argv: readonly string[]): LaunchArguments {
        return fromParsed(command(argv, process.cwd()).version(false).parseSync());
    }

    export function fromParsed({ _, $0, ...options }: Arguments): LaunchArguments {
        const values = new Map<string, string[]>();
        const negated = new Set<string>();
        for (const name of Object.keys(options)) {
            // For undeclared options yargs creates the camel alias when it first sees a dashed name.
            // Only the camel entry also contains values supplied before that first dashed spelling.
            const camel = name.includes('-') ? aliasOf(name, Parser.camelCase) : name;
            const option = options[camel] ?? options[name];
            const entries: unknown[] = Array.isArray(option) ? option : [option];
            const strings = entries.filter((value): value is string => typeof value === 'string');
            for (const alias of [name, aliasOf(camel, Parser.decamelize)]) {
                if (strings.length) {
                    values.set(alias, strings);
                }
                // Undeclared options can carry the literal string "false". Keep its value as well
                // as the explicit negation recognized by existing LaunchArguments consumers.
                if (entries.includes(false) || entries.includes('false')) {
                    negated.add(alias);
                }
            }
        }
        return { values: Object.fromEntries(values), negated: [...negated] };
    }
}
