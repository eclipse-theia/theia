// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { JSONValue } from '@phosphor/coreutils';
import { inject, injectable } from 'inversify';
import { InjectablePreferenceProxy } from './injectable-preference-proxy';
import { OverridePreferenceName } from './preference-language-override-service';
import { PreferenceProvider } from './preference-provider';
import { PreferenceChanges } from './preference-service';
import { PreferenceValidationService } from './preference-validation-service';

@injectable()
export class ValidatedPreferenceProxy<T extends Record<string, JSONValue>> extends InjectablePreferenceProxy<T> {
    @inject(PreferenceValidationService) protected readonly validator: PreferenceValidationService;

    /**
     * This map should be initialized only when the proxy starts listening to events from the PreferenceService in {@link ValidatedPreferenceProxy.subscribeToChangeEvents}.
     * Otherwise, it can't guarantee that the cache will remain up-to-date and is better off just retrieving the value.
     */
    protected validPreferences?: Map<string, JSONValue>;

    protected override handlePreferenceChanges(changes: PreferenceChanges): void {
        if (this.schema) {
            interface TrackedOverrides { overrides: OverridePreferenceName[] };
            const overrideTracker: Map<string, TrackedOverrides> = new Map();
            for (const change of Object.values(changes)) {
                const overridden = this.preferences.overriddenPreferenceName(change.preferenceName);
                if (this.isRelevantChange(change, overridden)) {
                    let doSet = false;
                    const baseName = overridden?.preferenceName ?? change.preferenceName;
                    const tracker: TrackedOverrides = overrideTracker.get(baseName) ?? (doSet = true, { overrides: [] });
                    if (overridden) {
                        tracker.overrides.push(overridden);
                    }
                    if (doSet) {
                        overrideTracker.set(baseName, tracker);
                    }
                }
            }
            for (const [baseName, tracker] of overrideTracker.entries()) {
                const validated: Array<[JSONValue, JSONValue]> = [];
                // This could go wrong if someone sets a lot of different, complex values for different language overrides simultaneously.
                // In the normal case, we'll just be doing strict equal checks on primitives.
                const getValidValue = (name: string): JSONValue => {
                    const configuredForCurrent = changes[name].newValue;
                    const existingValue = validated.find(([configuredForValid]) => PreferenceProvider.deepEqual(configuredForValid, configuredForCurrent));
                    if (existingValue) {
                        this.validPreferences?.set(name, existingValue[1]);
                        return existingValue[1];
                    }
                    const validValue = this.ensureValid(name, () => configuredForCurrent, true);
                    validated.push([configuredForCurrent, validValue]);
                    return validValue;
                };
                if (baseName in changes && this.isRelevantChange(changes[baseName])) {
                    const newValue = getValidValue(baseName);
                    const { domain, oldValue, preferenceName, scope } = changes[baseName];
                    this.fireChangeEvent(this.buildNewChangeEvent({ domain, oldValue, preferenceName, scope, newValue }));
                }
                for (const override of tracker.overrides) {
                    const name = this.preferences.overridePreferenceName(override);
                    const { domain, oldValue, preferenceName, scope } = changes[name];
                    const newValue = getValidValue(name);
                    this.fireChangeEvent(this.buildNewChangeEvent({ domain, oldValue, preferenceName, scope, newValue }, override));
                }
            }
        }
    }

    override getValue<K extends keyof T & string>(
        preferenceIdentifier: K | (OverridePreferenceName & { preferenceName: K; }), defaultValue: T[K], resourceUri = this.resourceUri
    ): T[K] {
        const preferenceName = OverridePreferenceName.is(preferenceIdentifier) ? this.preferences.overridePreferenceName(preferenceIdentifier) : preferenceIdentifier as string;
        return this.ensureValid(preferenceName, () => (super.getValue(preferenceIdentifier, defaultValue, resourceUri) ?? defaultValue), false) as T[K];
    }

    protected ensureValid<K extends keyof T & string>(preferenceName: K, getCandidate: () => T[K], isChange?: boolean): T[K] {
        if (!isChange && this.validPreferences?.has(preferenceName)) {
            return this.validPreferences.get(preferenceName) as T[K];
        }
        const candidate = getCandidate();
        const valid = this.validator.validateByName(preferenceName, candidate) as T[K];
        this.validPreferences?.set(preferenceName, valid);
        return valid;
    }

    protected override subscribeToChangeEvents(): void {
        this.validPreferences ??= new Map();
        super.subscribeToChangeEvents();
    }

    override dispose(): void {
        super.dispose();
        if (this.options.isDisposable) {
            this.validPreferences?.clear();
        }
    }
}
