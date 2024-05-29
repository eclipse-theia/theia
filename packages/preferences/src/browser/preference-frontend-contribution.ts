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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CliPreferences } from '../common/cli-preferences';
import { PreferenceService, PreferenceScope } from '@theia/core/lib/browser/preferences/preference-service';

@injectable()
export class PreferenceFrontendContribution implements FrontendApplicationContribution {
    @inject(CliPreferences)
    protected readonly CliPreferences: CliPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    onStart(): void {
        this.CliPreferences.getPreferences().then(async preferences => {
            await this.preferenceService.ready;
            for (const [key, value] of preferences) {
                this.preferenceService.set(key, value, PreferenceScope.User);
            }
        });
    }
}
