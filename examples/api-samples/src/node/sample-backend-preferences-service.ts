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

import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { SampleBackendPreferencesService } from '../common/preference-protocol';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PreferenceInspection, PreferenceLanguageOverrideService, PreferenceScope, PreferenceService } from '@theia/core';

@injectable()
export class SampleBackendPreferencesBackendServiceImpl implements SampleBackendPreferencesService {
    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(PreferenceLanguageOverrideService)
    protected readonly languageOverrideService: PreferenceLanguageOverrideService;

    async getPreference(key: string, overrideIdentifier: string): Promise<JSONValue | undefined> {
        let preferenceName = key;
        if (overrideIdentifier) {
            preferenceName = this.languageOverrideService.overridePreferenceName({ preferenceName, overrideIdentifier });

        }
        return this.preferenceService.get(preferenceName);
    }

    async inspectPreference(key: string, overrideIdentifier?: string): Promise<PreferenceInspection | undefined> {
        let preferenceName = key;
        if (overrideIdentifier) {
            preferenceName = this.languageOverrideService.overridePreferenceName({ preferenceName, overrideIdentifier });

        }
        return this.preferenceService.inspect(preferenceName);
    }

    async setPreference(key: string, overrideIdentifier: string | undefined, value: JSONValue): Promise<void> {
        let preferenceName = key;
        if (overrideIdentifier) {
            preferenceName = this.languageOverrideService.overridePreferenceName({ preferenceName, overrideIdentifier });

        }
        this.preferenceService.set(preferenceName, value, PreferenceScope.User);
    }

}
