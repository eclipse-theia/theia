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
import { CliPreferences } from '../common/cli-preferences';

@injectable()
export class PreferenceCliContribution implements CliContribution, CliPreferences {

    protected preferences: [string, unknown][] = [];

    configure(conf: Argv<{}>): void {
        conf.option('set-preference', {
            nargs: 1,
            desc: 'sets the specified preference'
        });
    }

    setArguments(args: Record<string, unknown>): void {
        if (args.setPreference) {
            const preferences: string[] = args.setPreference instanceof Array ? args.setPreference : [args.setPreference];
            for (const preference of preferences) {
                const firstEqualIndex = preference.indexOf('=');
                this.preferences.push([preference.substring(0, firstEqualIndex), JSON.parse(preference.substring(firstEqualIndex + 1))]);
            }
        }
    }

    async getPreferences(): Promise<[string, unknown][]> {
        return this.preferences;
    }

}
