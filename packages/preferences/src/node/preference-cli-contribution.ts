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

import { injectable } from '@theia/core/shared/inversify';
import { Argv } from '@theia/core/shared/yargs';
import { CliContribution } from '@theia/core/lib/node/cli';
import { RemoteCliContext, RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { CliPreferences, CliPreferenceEntry } from '../common/cli-preferences';

@injectable()
export class PreferenceCliContribution implements CliContribution, CliPreferences, RemoteCliContribution {

    protected preferences: [string, unknown][] = [];
    protected sessionPreferences: [string, unknown][] = [];

    configure(conf: Argv<{}>): void {
        conf.option('set-preference', {
            nargs: 1,
            desc: 'sets the specified preference (persisted to user settings)'
        });
        conf.option('session-preference', {
            nargs: 1,
            desc: 'sets the specified preference for this process only (in-memory, not persisted)'
        });
    }

    setArguments(args: Record<string, unknown>): void {
        if (args.setPreference) {
            this.parseInto(args.setPreference, this.preferences);
        }
        if (args.sessionPreference) {
            this.parseInto(args.sessionPreference, this.sessionPreferences);
        }
    }

    protected parseInto(raw: unknown, target: [string, unknown][]): void {
        const entries: string[] = raw instanceof Array ? raw : [raw as string];
        target.push(...CliPreferenceEntry.parseAll(entries));
    }

    async getPreferences(): Promise<[string, unknown][]> {
        return this.preferences;
    }

    async getSessionPreferences(): Promise<[string, unknown][]> {
        return this.sessionPreferences;
    }

    /**
     * Forward `--session-preference` values to the remote backend when attaching
     * to a remote (e.g. dev container). Values are base64-encoded JSON to survive
     * shell argument parsing intact.
     */
    enhanceArgs(_context: RemoteCliContext): string[] {
        return this.sessionPreferences.map(([key, value]) => {
            const encoded = Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
            return `--session-preference=${key}=base64:${encoded}`;
        });
    }

}
