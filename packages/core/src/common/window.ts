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
 * Query parameter carrying a one-shot, opaque identifier for the CLI arguments of a *forwarded*
 * launch (i.e. a second launch of the app while an instance is already running, whose `argv`
 * Electron delivers to the primary instance via the `second-instance` event).
 *
 * The arguments themselves are never placed in the URL: the URL is the one channel that carries
 * no trust (in a browser deployment it is attacker-writable), so putting `--session-preference`
 * or similar there would let a crafted link inject settings. Instead the Electron main process
 * keeps the `argv` keyed by this identifier and the window redeems it once, over the authenticated
 * Electron IPC channel, via {@link WindowSearchParams}. See `WindowLaunchArgs`.
 */
export const LAUNCH_ID_PARAM = 'launchId';

/**
 * Query parameter set on a window that is being opened to attach to a remote target from the CLI
 * (e.g. `--attach-container`). It lets the frontend show a dedicated "attaching" screen from the
 * very first paint, instead of briefly exposing an interactive local workbench that is about to be
 * replaced when the window reloads into the remote. This flag carries no sensitive data; it only
 * controls whether the transient "attaching" screen is shown.
 */
export const ATTACH_PENDING_PARAM = 'attachPending';

/**
 * Dependency-free helpers to read individual CLI options out of a launch `argv`. Usable both in
 * the Electron main process (to inspect a forwarded launch) and in the renderer (to apply the
 * redeemed options to the current window).
 */
export namespace LaunchArgv {

    /**
     * Returns the last value of a `--name value` or `--name=value` option, or `undefined` if
     * the option is absent. A token starting with `--` is never consumed as a value.
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
                if (next !== undefined && !next.startsWith('--')) {
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
