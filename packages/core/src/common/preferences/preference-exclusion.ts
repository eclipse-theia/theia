// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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

import { inject, injectable, named } from 'inversify';
import { ContributionProvider } from '../contribution-provider.js';
import { Disposable, DisposableCollection } from '../disposable.js';
import { Emitter, Event } from '../event.js';
import URI from '../uri.js';
import { PreferenceDataProperty } from './preference-schema.js';
import { PreferenceScope } from './preference-scope.js';

export interface PreferenceExclusionContext {
    /** The scope of the provider that read the value. */
    readonly scope: PreferenceScope;
    /** The settings file the value was read from. */
    readonly configUri: URI;
    /** The schema property of the preference, if one is registered. */
    readonly property: PreferenceDataProperty | undefined;
    readonly overrideIdentifier?: string;
}

export const PreferenceExclusionPolicy = Symbol('PreferenceExclusionPolicy');
/**
 * Decides which preferences a provider must leave out of the values it reads from its settings file.
 * Bind an implementation to {@link PreferenceExclusionPolicy} to add a policy.
 */
export interface PreferenceExclusionPolicy {
    /** Fires when {@link isExcluded} may answer differently than before. */
    readonly onDidChange: Event<void>;
    /**
     * Whether a provider must omit the preference under the current conditions.
     * A policy that hasn't decided yet must return `true` for the preferences it covers.
     */
    isExcluded(preferenceName: string, context: PreferenceExclusionContext): boolean;
}

/** A value that is present in a settings file and isn't applied. */
export interface ExcludedPreference {
    readonly preferenceName: string;
    readonly overrideIdentifier?: string;
    readonly scope: PreferenceScope;
    readonly configUri: URI;
}

export const PreferenceExclusionService = Symbol('PreferenceExclusionService');
/**
 * Combines every {@link PreferenceExclusionPolicy}. Providers ask it which values to omit when they read
 * their settings file, and report back what they omitted.
 */
export interface PreferenceExclusionService {
    /**
     * Fires when a policy changes, once {@link isExcluded} has been called for the first time.
     * Providers then apply the policies again to the content they last read.
     */
    readonly onDidChange: Event<void>;
    isExcluded(preferenceName: string, context: PreferenceExclusionContext): boolean;

    /** The values that settings files contain and that aren't applied, optionally for one scope. */
    getExcludedPreferences(scope?: PreferenceScope): readonly ExcludedPreference[];
    readonly onDidChangeExcludedPreferences: Event<void>;
    /** For providers: replaces what the given settings file is known to contain and not apply. */
    setExcludedPreferences(configUri: URI, excluded: readonly ExcludedPreference[]): void;
}

@injectable()
export class PreferenceExclusionServiceImpl implements PreferenceExclusionService, Disposable {

    @inject(ContributionProvider) @named(PreferenceExclusionPolicy)
    protected readonly policyProvider: ContributionProvider<PreferenceExclusionPolicy>;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected readonly onDidChangeExcludedPreferencesEmitter = new Emitter<void>();
    readonly onDidChangeExcludedPreferences = this.onDidChangeExcludedPreferencesEmitter.event;

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter, this.onDidChangeExcludedPreferencesEmitter);

    protected readonly excluded = new Map<string, readonly ExcludedPreference[]>();

    protected policies: PreferenceExclusionPolicy[] | undefined;

    // Resolved on first use: a policy may depend on the `PreferenceService`, whose providers depend on this service.
    protected getPolicies(): PreferenceExclusionPolicy[] {
        if (!this.policies) {
            this.policies = this.policyProvider.getContributions();
            for (const policy of this.policies) {
                this.toDispose.push(policy.onDidChange(() => this.onDidChangeEmitter.fire()));
            }
        }
        return this.policies;
    }

    isExcluded(preferenceName: string, context: PreferenceExclusionContext): boolean {
        return this.getPolicies().some(policy => policy.isExcluded(preferenceName, context));
    }

    getExcludedPreferences(scope?: PreferenceScope): readonly ExcludedPreference[] {
        const all = Array.from(this.excluded.values()).flat();
        return scope === undefined ? all : all.filter(excluded => excluded.scope === scope);
    }

    setExcludedPreferences(configUri: URI, excluded: readonly ExcludedPreference[]): void {
        const key = configUri.toString();
        const previous = this.excluded.get(key) ?? [];
        if (excluded.length) {
            this.excluded.set(key, excluded);
        } else {
            this.excluded.delete(key);
        }
        if (!this.isSame(previous, excluded)) {
            this.onDidChangeExcludedPreferencesEmitter.fire();
        }
    }

    protected isSame(a: readonly ExcludedPreference[], b: readonly ExcludedPreference[]): boolean {
        return a.length === b.length && a.every((excluded, index) =>
            excluded.preferenceName === b[index].preferenceName
            && excluded.overrideIdentifier === b[index].overrideIdentifier
            && excluded.scope === b[index].scope);
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
