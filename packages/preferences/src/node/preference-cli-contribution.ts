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

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { Argv } from '@theia/core/shared/yargs';
import { CliContribution } from '@theia/core/lib/node/cli';
import { RemoteCliContext, RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { CliPreference, CliPreferences, CliPreferenceEntry } from '../common/cli-preferences';
import { ILogger } from '@theia/core';

@injectable()
export class PreferenceCliContribution implements CliContribution, CliPreferences, RemoteCliContribution {

    @inject(ILogger) @named('preferences:PreferenceCliContribution')
    protected readonly logger: ILogger;

    protected preferences: CliPreference[] = [];
    protected sessionPreferences: CliPreference[] = [];

    configure(conf: Argv<{}>): void {
        conf.option('set-preference', {
            nargs: 1,
            desc: 'sets the specified preference (persisted to user settings). '
                + 'Language override: \'[languageId].preferenceName=JSONVALUE\' (quote the brackets).'
        });
        conf.option('session-preference', {
            nargs: 1,
            desc: 'sets the specified preference for this process only (in-memory, not persisted). '
                + 'Language override: \'[languageId].preferenceName=JSONVALUE\' (quote the brackets).'
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

    protected parseInto(raw: unknown, target: CliPreference[]): void {
        const entries: string[] = raw instanceof Array ? raw : [raw as string];
        target.push(...CliPreferenceEntry.parseAll(entries, message => this.logger.warn(message)));
    }

    async getPreferences(): Promise<CliPreference[]> {
        return this.preferences;
    }

    async getSessionPreferences(): Promise<CliPreference[]> {
        return this.sessionPreferences;
    }

    /**
     * Forward `--session-preference` values to the remote backend when attaching
     * to a remote (e.g. dev container). Values are base64-encoded JSON to survive
     * shell argument parsing intact. Language overrides are re-encoded as
     * `[languageId].preferenceName` so the remote CLI can parse them again.
     */
    enhanceArgs(_context: RemoteCliContext): string[] {
        return this.sessionPreferences.map(entry => CliPreferenceEntry.toArg('session-preference', entry));
    }

}
