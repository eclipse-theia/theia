/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { interfaces } from 'inversify';
import { PreferenceProvider } from '../';
import { PreferenceScope } from '../preference-scope';
import { PreferenceProviderDataChanges, PreferenceProviderDataChange } from '../preference-provider';

export class MockPreferenceProvider extends PreferenceProvider {
    readonly prefs: { [p: string]: any } = {};

    constructor(protected scope: PreferenceScope) {
        super();
    }

    public emitPreferencesChangedEvent(changes: PreferenceProviderDataChanges | PreferenceProviderDataChange[]): void {
        super.emitPreferencesChangedEvent(changes);
    }

    public markReady(): void {
        this._ready.resolve();
    }

    getPreferences(): { [p: string]: any } {
        return this.prefs;
    }
    async setPreference(preferenceName: string, newValue: any, resourceUri?: string): Promise<boolean> {
        const oldValue = this.prefs[preferenceName];
        this.prefs[preferenceName] = newValue;
        this.emitPreferencesChangedEvent([{ preferenceName, oldValue, newValue, scope: this.scope, domain: [] }]);
        return true;
    }
}

export function bindMockPreferenceProviders(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);

    bind(PreferenceProvider).toDynamicValue(ctx => new MockPreferenceProvider(PreferenceScope.User)).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).toDynamicValue(ctx => new MockPreferenceProvider(PreferenceScope.Workspace)).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).toDynamicValue(ctx => new MockPreferenceProvider(PreferenceScope.Folder)).inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
}
