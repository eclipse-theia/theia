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
 * Query parameter used to carry the CLI arguments of a *forwarded* launch (i.e. a second
 * launch of the app while an instance is already running, whose `argv` Electron delivers to
 * the primary instance via the `second-instance` event) to the newly created window.
 *
 * Per-window CLI options such as `--attach-container` and `--session-preference` would
 * otherwise be dropped, because they are parsed only once by the shared backend at cold
 * start. Forwarding them through the window URL lets each window apply its own options.
 */
export const SECOND_INSTANCE_ARGS_PARAM = 'secondInstanceArgs';

/**
 * Helpers for encoding a forwarded `argv` into a window search parameter and for reading
 * individual CLI options back out of it on the frontend. Kept dependency-free so it can run
 * in both the Electron main process (encoding) and the renderer (decoding/parsing).
 */
export namespace SecondInstanceArgv {

    /**
     * Encodes an `argv` array into a value safe to place in a URL query string. The result
     * contains no `&`, `=`, or whitespace, so it survives {@link WindowSearchParams} assembly
     * and is decoded back to the original JSON by `URLSearchParams`.
     */
    export function encode(argv: string[]): string {
        return encodeURIComponent(JSON.stringify(argv));
    }

    /**
     * Decodes a value produced by {@link encode}. Accepts the value as returned by
     * `URLSearchParams.get` (already percent-decoded) as well as a still-percent-encoded value.
     * Returns an empty array for missing or malformed input.
     */
    export function decode(value: string | undefined | null): string[] {
        if (!value) {
            return [];
        }
        for (const candidate of [value, tryDecodeURIComponent(value)]) {
            if (candidate === undefined) {
                continue;
            }
            try {
                const parsed = JSON.parse(candidate);
                if (Array.isArray(parsed)) {
                    return parsed.filter((entry): entry is string => typeof entry === 'string');
                }
            } catch {
                // try the next candidate
            }
        }
        return [];
    }

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

    function tryDecodeURIComponent(value: string): string | undefined {
        try {
            return decodeURIComponent(value);
        } catch {
            return undefined;
        }
    }
}
