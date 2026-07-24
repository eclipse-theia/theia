// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

export const CliPreferences = Symbol('CliPreferences');
export const CliPreferencesPath = '/services/cli-preferences';

export interface CliPreferences {
    getPreferences(): Promise<[string, unknown][]>;
    getSessionPreferences(): Promise<[string, unknown][]>;
}

export namespace CliPreferenceEntry {

    /**
     * Parses a single `KEY=JSONVALUE` preference assignment as accepted by `--set-preference`
     * and `--session-preference`. The value may be `base64:`-prefixed (used when forwarding
     * values that must survive shell/URL transport intact). Returns `undefined` (after logging a
     * warning) when the entry has no key or the value is not valid JSON.
     */
    export function parse(entry: string): [string, unknown] | undefined {
        const firstEqualIndex = entry.indexOf('=');
        if (firstEqualIndex <= 0) {
            console.warn(`Ignoring preference CLI argument "${entry}": expected KEY=JSONVALUE.`);
            return undefined;
        }
        let rawValue = entry.substring(firstEqualIndex + 1);
        if (rawValue.startsWith('base64:')) {
            rawValue = decodeBase64(rawValue.substring('base64:'.length));
        }
        try {
            return [entry.substring(0, firstEqualIndex), JSON.parse(rawValue)];
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            console.warn(`Ignoring preference CLI argument "${entry}": value is not valid JSON (${reason}).`);
            return undefined;
        }
    }

    /**
     * Formats a preference entry as a CLI argument of the form
     * `--<optionName>=<key>=base64:<base64(JSON(value))>`, the inverse of {@link parse}.
     *
     * The value is base64-encoded so it survives shell/URL transport intact (e.g. when the
     * argument is passed to a remote backend over an SSH command line).
     */
    export function toArg(optionName: string, [key, value]: [string, unknown]): string {
        return `--${optionName}=${key}=base64:${encodeBase64(JSON.stringify(value))}`;
    }

    /**
     * Parses a list of `KEY=JSONVALUE` assignments, dropping any invalid entries.
     */
    export function parseAll(entries: readonly string[]): [string, unknown][] {
        const result: [string, unknown][] = [];
        for (const entry of entries) {
            const parsed = parse(entry);
            if (parsed) {
                result.push(parsed);
            }
        }
        return result;
    }

    function decodeBase64(value: string): string {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(value, 'base64').toString('utf-8');
        }
        // Browser fallback: `atob` yields a binary string; re-decode it as UTF-8.
        const binary = atob(value);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    function encodeBase64(value: string): string {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(value, 'utf-8').toString('base64');
        }
        // Browser fallback: encode as UTF-8 bytes before `btoa`, which only handles binary strings.
        const bytes = new TextEncoder().encode(value);
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }
        return btoa(binary);
    }
}
