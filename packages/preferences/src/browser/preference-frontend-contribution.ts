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
import { PreferenceService, PreferenceScope } from '@theia/core/lib/common/preferences';

@injectable()
export class PreferenceFrontendContribution implements FrontendApplicationContribution {
    @inject(CliPreferences)
    protected readonly CliPreferences: CliPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    onStart(): void {
        this.applyCliPreferences();
    }

    protected async applyCliPreferences(): Promise<void> {
        // Fetch both buckets in parallel; both are RPC hops to the same backend and
        // can overlap with the preference service initialising its providers.
        const [session, persistent] = await Promise.all([
            this.CliPreferences.getSessionPreferences().catch(e => {
                console.warn('Failed to fetch --session-preference values:', e);
                return [] as [string, unknown][];
            }),
            this.CliPreferences.getPreferences().catch(e => {
                console.warn('Failed to fetch --set-preference values:', e);
                return [] as [string, unknown][];
            })
        ]);

        // `preferenceService.set()` needs the target provider registered in the providers
        // map, which only happens once `initializeProviders()` has walked every scope and
        // resolved `ready`. Writing before that returns `undefined` from `getProvider()`
        // and the call throws "Unable to write to ... Settings".
        await this.preferenceService.ready;

        for (const [key, value] of session) {
            this.preferenceService.set(key, value, PreferenceScope.Session);
        }
        if (session.length > 0) {
            // Log keys only. Values may carry overrides for security-sensitive prefs
            // (e.g. AI tool auto-approval) and should not leak into screenshots or support bundles.
            console.info(`Applied ${session.length} --session-preference value(s):`,
                session.map(([k]) => k).join(', '));
        }

        for (const [key, value] of persistent) {
            this.preferenceService.set(key, value, PreferenceScope.User);
        }
    }
}
