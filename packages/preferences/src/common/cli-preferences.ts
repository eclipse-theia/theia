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

import { OVERRIDE_PROPERTY_PATTERN } from '@theia/core';

export const CliPreferences = Symbol('CliPreferences');
export const CliPreferencesPath = '/services/cli-preferences';

/**
 * A preference supplied via `--set-preference` or `--session-preference`.
 * Language overrides use the encoded CLI key `[languageId].preferenceName`;
 * {@link CliPreferenceEntry.parse} splits that into `preferenceName` + `overrideIdentifier`.
 */
export interface CliPreference {
    preferenceName: string;
    value: unknown;
    overrideIdentifier?: string;
}

export interface CliPreferences {
    getPreferences(): Promise<CliPreference[]>;
    getSessionPreferences(): Promise<CliPreference[]>;
}

export namespace CliPreferenceEntry {

    /**
     * Sink for warnings about malformed entries. Callers running in an Inversify context should
     * pass their named `ILogger`, since these helpers live in `common` and cannot inject one
     * themselves. Defaults to `console.warn`.
     */
    export type WarningSink = (message: string) => void;

    const defaultWarn: WarningSink = message => console.warn(message);

    /**
     * Encodes a {@link CliPreference} back to the CLI key form used by `--set-preference` /
     * `--session-preference` (e.g. `[typescript].editor.tabSize`).
     */
    export function encodedKey(entry: CliPreference): string {
        return entry.overrideIdentifier ? `[${entry.overrideIdentifier}].${entry.preferenceName}` : entry.preferenceName;
    }

    /**
     * Parses a single `KEY=JSONVALUE` preference assignment as accepted by `--set-preference`
     * and `--session-preference`. The value may be `base64:`-prefixed (used when forwarding
     * values that must survive shell/URL transport intact). Returns `undefined` (after logging a
     * warning to {@link warn}) when the entry has no key or the value is not valid JSON.
     *
     * Language-override keys (`[languageId].preferenceName`) are split into
     * `preferenceName` + `overrideIdentifier` using the same first-dot +
     * {@link OVERRIDE_PROPERTY_PATTERN} check as resource preference providers.
     * Nested-object CLI keys (`[typescript]={...}`) have no `.` after the brackets and
     * are kept as a literal `preferenceName`.
     */
    export function parse(entry: string, warn: WarningSink = defaultWarn): CliPreference | undefined {
        const firstEqualIndex = entry.indexOf('=');
        if (firstEqualIndex <= 0) {
            warn(`Ignoring preference CLI argument "${entry}": expected KEY=JSONVALUE.`);
            return undefined;
        }
        const rawValue = entry.substring(firstEqualIndex + 1);
        try {
            // Decoding happens inside the `try` so that a malformed `base64:` payload is reported
            // like any other invalid value instead of throwing out of `parse`.
            const value = rawValue.startsWith('base64:') ? decodeBase64(rawValue.substring('base64:'.length)) : rawValue;
            return toCliPreference(entry.substring(0, firstEqualIndex), JSON.parse(value));
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            warn(`Ignoring preference CLI argument "${entry}": value is not valid JSON (${reason}).`);
            return undefined;
        }
    }

    /**
     * Formats a preference entry as a CLI argument of the form
     * `--<optionName>=<key>=base64:<base64(JSON(value))>`, the inverse of {@link parse}.
     *
     * The value is base64-encoded so it survives shell/URL transport intact (e.g. when the
     * argument is passed to a remote backend over an SSH command line). Language overrides are
     * re-encoded as `[languageId].preferenceName` so the remote CLI can parse them again.
     */
    export function toArg(optionName: string, entry: CliPreference): string {
        return `--${optionName}=${encodedKey(entry)}=base64:${encodeBase64(JSON.stringify(entry.value))}`;
    }

    /**
     * Parses a list of `KEY=JSONVALUE` assignments, dropping any invalid entries and reporting
     * them to {@link warn}.
     */
    export function parseAll(entries: readonly string[], warn: WarningSink = defaultWarn): CliPreference[] {
        const result: CliPreference[] = [];
        for (const entry of entries) {
            const parsed = parse(entry, warn);
            if (parsed) {
                result.push(parsed);
            }
        }
        return result;
    }

    function toCliPreference(rawKey: string, value: unknown): CliPreference {
        const index = rawKey.indexOf('.');
        if (index !== -1) {
            const matches = rawKey.substring(0, index).match(OVERRIDE_PROPERTY_PATTERN);
            if (matches) {
                return { preferenceName: rawKey.substring(index + 1), value, overrideIdentifier: matches[1] };
            }
        }
        return { preferenceName: rawKey, value };
    }

    // `Buffer` is available on the backend and is polyfilled into the frontend bundle by the
    // esbuild generator, so a single implementation covers both. It also handles UTF-8 directly,
    // unlike `atob`/`btoa`, which only deal in binary strings.

    function decodeBase64(value: string): string {
        return Buffer.from(value, 'base64').toString('utf-8');
    }

    function encodeBase64(value: string): string {
        return Buffer.from(value, 'utf-8').toString('base64');
    }
}
