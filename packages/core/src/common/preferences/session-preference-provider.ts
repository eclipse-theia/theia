// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { JSONObject, JSONValue } from '@lumino/coreutils';
import { injectable, postConstruct } from 'inversify';
import { PreferenceProvider, PreferenceProviderDataChange } from './preference-provider';
import { PreferenceProviderImpl } from './preference-provider-impl';
import { PreferenceScope } from './preference-scope';

/**
 * In-memory preference provider used for process-lifetime overrides such as those
 * supplied via the `--session-preference` CLI option. Values live in memory only
 * and are dropped when the process exits.
 */
@injectable()
export class SessionPreferenceProvider extends PreferenceProviderImpl implements PreferenceProvider {

    protected readonly preferences = new Map<string, JSONValue>();

    @postConstruct()
    protected init(): void {
        this._ready.resolve();
    }

    override canHandleScope(scope: PreferenceScope): boolean {
        return scope === PreferenceScope.Session;
    }

    getPreferences(): JSONObject {
        const result: JSONObject = {};
        for (const [name, value] of this.preferences) {
            result[name] = value;
        }
        return result;
    }

    async setPreference(key: string, value: JSONValue | undefined): Promise<boolean> {
        const oldValue = this.preferences.get(key);
        if (value === undefined) {
            if (!this.preferences.has(key)) {
                return false;
            }
            this.preferences.delete(key);
        } else {
            this.preferences.set(key, value);
        }
        const change: PreferenceProviderDataChange = {
            preferenceName: key,
            newValue: value,
            oldValue,
            scope: PreferenceScope.Session
        };
        await this.emitPreferencesChangedEvent([change]);
        return true;
    }
}
