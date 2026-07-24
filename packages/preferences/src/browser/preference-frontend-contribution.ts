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
import { SECOND_INSTANCE_ARGS_PARAM, SecondInstanceArgv } from '@theia/core/lib/common/window';
import { CliPreferences, CliPreferenceEntry } from '../common/cli-preferences';
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
        const { session, persistent } = await this.resolveCliPreferences();

        // `preferenceService.set()` needs the target provider registered in the providers
        // map, which only happens once `initializeProviders()` has walked every scope and
        // resolved `ready`. Writing before that returns `undefined` from `getProvider()`
        // and the call throws "Unable to write to ... Settings".
        await this.preferenceService.ready;

        // Session writes go first and are awaited sequentially so that when the same key
        // appears in both `--session-preference` and `--set-preference`, the persistent
        // write in the next block sees a settled session provider (and correctly triggers
        // `evictSessionOverride`) rather than racing with the session write.
        await this.applyAll(session, PreferenceScope.Session);
        if (session.length > 0) {
            // Log keys only. Values may carry overrides for security-sensitive prefs
            // (e.g. AI tool auto-approval) and should not leak into screenshots or support bundles.
            console.info(`Applied ${session.length} --session-preference value(s):`,
                session.map(([k]) => k).join(', '));
        }

        await this.applyAll(persistent, PreferenceScope.User);
    }

    /**
     * Resolves the CLI-provided preferences to apply to this window.
     *
     * A forwarded (second-instance) launch carries its CLI arguments in the window URL. For such
     * windows those arguments are the only source, because the shared backend still reflects the
     * original cold-start launch and cannot distinguish between windows. A cold-start window has no
     * forwarded arguments and reads them from the backend instead.
     */
    protected async resolveCliPreferences(): Promise<{ session: [string, unknown][], persistent: [string, unknown][] }> {
        const forwarded = this.getForwardedArgv();
        if (forwarded !== undefined) {
            return {
                session: CliPreferenceEntry.parseAll(SecondInstanceArgv.getValues(forwarded, 'session-preference')),
                persistent: CliPreferenceEntry.parseAll(SecondInstanceArgv.getValues(forwarded, 'set-preference'))
            };
        }
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
        return { session, persistent };
    }

    /**
     * Returns the forwarded launch `argv` carried in the window URL, or `undefined` for a
     * cold-start window (where the parameter is absent).
     */
    protected getForwardedArgv(): string[] | undefined {
        const raw = new URLSearchParams(location.search).get(SECOND_INSTANCE_ARGS_PARAM);
        // eslint-disable-next-line no-null/no-null
        return raw === null ? undefined : SecondInstanceArgv.decode(raw);
    }

    /**
     * Applies a batch of CLI-provided preferences sequentially. A rejection from an
     * individual write (bad key, invalid scope, etc.) is logged and does not abort the
     * remaining writes, and it is not left as an unhandled promise rejection.
     */
    protected async applyAll(entries: ReadonlyArray<[string, unknown]>, scope: PreferenceScope): Promise<void> {
        for (const [key, value] of entries) {
            try {
                await this.preferenceService.set(key, value, scope);
            } catch (e) {
                console.warn(`Failed to apply CLI preference "${key}" to ${PreferenceScope[scope]} scope:`, e);
            }
        }
    }
}
