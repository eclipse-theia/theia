// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { JSONObject, JSONValue } from '@lumino/coreutils';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider, PreferenceProviderDataChange, PreferenceResolveResult } from './preference-provider';
import { inject, injectable, postConstruct } from 'inversify';
import { PreferenceSchemaService } from './preference-schema';
import { Deferred } from '../promise-util';
import { PreferenceLanguageOverrideService } from './preference-language-override-service';
import { PreferenceProviderBase } from './preference-provider-impl';

// *****************************************************************************

@injectable()
export class DefaultsPreferenceProvider extends PreferenceProviderBase implements PreferenceProvider {

    @inject(PreferenceSchemaService)
    protected readonly preferenceSchemaService: PreferenceSchemaService;

    @inject(PreferenceLanguageOverrideService)
    protected readonly preferenceOverrideService: PreferenceLanguageOverrideService;

    protected readonly _ready = new Deferred<void>();
    ready: Promise<void> = this._ready.promise;

    @postConstruct()
    init(): void {
        this.toDispose.push(this.preferenceSchemaService.onDidChangeDefaultValue(e => {
            this.emitPreferencesChangedEvent([this.changeFor(e.key, e.overrideIdentifier, e.oldValue, e.newValue)]);
        }));
        this._ready.resolve();
    }

    protected changeFor(key: string, overrideIdentifier: string | undefined, oldValue: JSONValue | undefined, newValue: JSONValue | undefined): PreferenceProviderDataChange {
        return {
            preferenceName: key,
            newValue: newValue,
            oldValue: oldValue,
            scope: PreferenceScope.Default,
            overrideIdentifier: overrideIdentifier
        };
    }

    canHandleScope(scope: PreferenceScope): boolean {
        return scope === PreferenceScope.Default;
    }
    get<T>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): T | undefined {
        return this.preferenceSchemaService.getDefaultValue(preferenceName, overrideIdentifier) as T;
    }

    setPreference(key: string, value: JSONValue, resourceUri?: string): Promise<boolean> {
        return Promise.resolve(false);
    }

    resolve<T>(preferenceName: string, resourceUri?: string, overrideIdentifier?: string): PreferenceResolveResult<T> {
        return {
            value: this.preferenceSchemaService.inspectDefaultValue(preferenceName, overrideIdentifier) as T,
            configUri: undefined
        };
    }

    getPreferences(): JSONObject {
        return this.preferenceSchemaService.getDefaultValues();
    }
}
