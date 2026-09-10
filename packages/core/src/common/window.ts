// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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
 * The window hash value that is used to spawn a new default window.
 */
export const DEFAULT_WINDOW_HASH: string = '!empty';

/**
 * The options for opening new windows.
 */
export interface NewWindowOptions {
    /**
     * Controls whether the window should be opened externally.
     */
    readonly external?: boolean;
}

export interface WindowSearchParams {
    [key: string]: string
}

/**
 * Query parameter set on a window whose contents a main-process `ElectronMainApplicationContribution`
 * has *claimed* (see its `claimsWindow` hook), e.g. a window opened from the CLI to attach to a
 * remote target. It is a synchronous, first-paint hint that lets the responsible frontend
 * contribution show a dedicated placeholder (such as an "attaching" screen) instead of briefly
 * exposing an interactive local workbench that is about to be replaced when the window reloads.
 *
 * The flag carries no sensitive data and, deliberately, no instructions: the claiming contribution
 * (not core) knows what `--attach-container` and similar mean. The actual per-window CLI options are
 * never placed in the URL; they are redeemed over the authenticated IPC channel. See `LaunchArgsStore`.
 */
export const WINDOW_CLAIMED_PARAM = 'windowClaimed';

/**
 * Dependency-free helpers to read individual CLI options out of a launch `argv`. Usable both in
 * the Electron main process (to inspect a forwarded launch) and in the renderer (to apply the
 * redeemed options to the current window).
 *
 * The grammar intentionally mirrors what yargs accepts on cold start for the same flags: a value
 * given as either `--name value` or `--name=value`, options repeatable to yield multiple values,
 * and a token that itself looks like an option (starts with `-`) never consumed as a value.
 */
export namespace LaunchArgv {

    /**
     * Returns the last value of a `--name value` or `--name=value` option, or `undefined` if
     * the option is absent. A token starting with `-` is never consumed as a value.
     */
    export function getValue(argv: string[], name: string): string | undefined {
        const values = getValues(argv, name);
        return values.length > 0 ? values[values.length - 1] : undefined;
    }

    /**
     * Returns every value of a (possibly repeated) `--name value` / `--name=value` option.
     */
    export function getValues(argv: string[], name: string): string[] {
        const result: string[] = [];
        const inline = `--${name}=`;
        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            if (token.startsWith(inline)) {
                result.push(token.substring(inline.length));
            } else if (token === `--${name}`) {
                const next = argv[i + 1];
                // Like yargs, do not consume a following option-looking token (`-x`/`--x`) as the value.
                if (next !== undefined && !next.startsWith('-')) {
                    result.push(next);
                    i++;
                }
            }
        }
        return result;
    }

    /**
     * Whether a boolean option was explicitly disabled, i.e. `--no-name` or `--name=false`.
     */
    export function isNegated(argv: string[], name: string): boolean {
        return argv.includes(`--no-${name}`) || argv.includes(`--${name}=false`);
    }
}
