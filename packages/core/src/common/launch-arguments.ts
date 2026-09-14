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
 * The CLI options of a launch, already parsed. A window opened for a *forwarded* launch (see the
 * `second-instance` handling in `ElectronMainApplication`) receives this rather than a raw `argv`:
 * the command line is parsed once, in the Electron main process, so that no consumer has to
 * re-implement the argument grammar and the frontend never sees an unparsed command line.
 */
export interface LaunchArguments {

    /**
     * The values of each (possibly repeated) `--name value` / `--name=value` option, in the order
     * they appeared on the command line.
     */
    readonly values: Readonly<Record<string, readonly string[]>>;

    /** The options that were explicitly negated, i.e. `--no-name` or `--name=false`. */
    readonly negated: readonly string[];
}

export namespace LaunchArguments {

    /** A launch that carried no options. */
    export const EMPTY: LaunchArguments = { values: {}, negated: [] };

    /** Every value of a (possibly repeated) option, or an empty array when the option is absent. */
    export function values(args: LaunchArguments, name: string): readonly string[] {
        return args.values[name] ?? [];
    }

    /**
     * The last value of an option, or `undefined` when the option is absent. Last wins, so that a
     * repeated option behaves like it does on a normal command line.
     */
    export function lastValue(args: LaunchArguments, name: string): string | undefined {
        const all = values(args, name);
        return all.length > 0 ? all[all.length - 1] : undefined;
    }

    /** Whether a boolean option was explicitly disabled, i.e. `--no-name` or `--name=false`. */
    export function isNegated(args: LaunchArguments, name: string): boolean {
        return args.negated.includes(name);
    }
}
