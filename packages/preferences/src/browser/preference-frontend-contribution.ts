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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { LaunchArgv } from '@theia/core/lib/common/window';
import { WindowLaunchArgs } from '@theia/core/lib/browser/window/window-launch-args';
import { CliPreferences, CliPreferenceEntry } from '../common/cli-preferences';
import { PreferenceService, PreferenceScope } from '@theia/core/lib/common/preferences';
import { ILogger } from '@theia/core';

@injectable()
export class PreferenceFrontendContribution implements FrontendApplicationContribution {
    @inject(CliPreferences)
    protected readonly CliPreferences: CliPreferences;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ILogger) @named('preferences:PreferenceFrontendContribution')
    protected readonly logger: ILogger;

    @inject(WindowLaunchArgs)
    protected readonly launchArgs: WindowLaunchArgs;

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
            this.logger.info(`Applied ${session.length} --session-preference value(s):`,
                session.map(([k]) => k).join(', '));
        }

        await this.applyAll(persistent, PreferenceScope.User);
    }

    /**
     * Resolves the CLI-provided preferences to apply to this window.
     *
     * The shared backend reflects the original cold-start launch (it cannot distinguish between
     * windows), so it supplies the process-wide CLI preferences. A forwarded (second-instance)
     * window additionally carries its own arguments, redeemed here from the trusted main process, and
     * layers them on top, overriding by key. Merging (rather than replacing) means a plain
     * second-instance window keeps the process-wide values instead of dropping them, while an attach
     * window still gets its own overrides.
     */
    protected async resolveCliPreferences(): Promise<{ session: [string, unknown][], persistent: [string, unknown][] }> {
        // Fetch both buckets in parallel; both are RPC hops to the same backend and
        // can overlap with the preference service initialising its providers.
        const [session, persistent] = await Promise.all([
            this.CliPreferences.getSessionPreferences().catch(e => {
                this.logger.warn('Failed to fetch --session-preference values:', e);
                return [] as [string, unknown][];
            }),
            this.CliPreferences.getPreferences().catch(e => {
                this.logger.warn('Failed to fetch --set-preference values:', e);
                return [] as [string, unknown][];
            })
        ]);
        const forwarded = await this.launchArgs.getLaunchArgs();
        if (forwarded === undefined) {
            return { session, persistent };
        }
        const warn = (message: string) => this.logger.warn(message);
        return {
            session: this.mergeEntries(session, CliPreferenceEntry.parseAll(LaunchArgv.getValues(forwarded, 'session-preference'), warn)),
            persistent: this.mergeEntries(persistent, CliPreferenceEntry.parseAll(LaunchArgv.getValues(forwarded, 'set-preference'), warn))
        };
    }

    /** Overlays `overrides` onto `base`, later entries winning per key while preserving order (base first). */
    protected mergeEntries(base: ReadonlyArray<[string, unknown]>, overrides: ReadonlyArray<[string, unknown]>): [string, unknown][] {
        const merged = new Map<string, unknown>();
        for (const [key, value] of [...base, ...overrides]) {
            merged.set(key, value);
        }
        return [...merged];
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
                this.logger.warn(`Failed to apply CLI preference "${key}" to ${PreferenceScope[scope]} scope:`, e);
            }
        }
    }
}
