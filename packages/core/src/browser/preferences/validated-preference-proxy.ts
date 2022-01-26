/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

import { JSONValue } from '@phosphor/coreutils';
import { inject, injectable } from 'inversify';
import { PreferenceValidationService } from '.';
import { InjectablePreferenceProxy } from './injectable-preference-proxy';
import { OverridePreferenceName } from './preference-language-override-service';
import { PreferenceChanges } from './preference-service';

@injectable()
export class ValidatedPreferenceProxy<T extends Record<string, JSONValue>> extends InjectablePreferenceProxy<T> {
    @inject(PreferenceValidationService) protected readonly validator: PreferenceValidationService;

    protected validPreferences: Map<string, JSONValue> = new Map();

    protected override handlePreferenceChanges(changes: PreferenceChanges): void {
        if (this.schema) {
            interface TrackedOverrides { value?: JSONValue, overrides: OverridePreferenceName[] };
            const overrideTracker: Map<string, TrackedOverrides> = new Map();
            for (const change of Object.values(changes)) {
                const overridden = this.preferences.overriddenPreferenceName(change.preferenceName);
                if (this.isRelevantChange(change, overridden)) {
                    let doSet = false;
                    const baseName = overridden?.preferenceName ?? change.preferenceName;
                    const tracker: TrackedOverrides = overrideTracker.get(baseName) ?? (doSet = true, { value: undefined, overrides: [] });
                    if (overridden) {
                        tracker.overrides.push(overridden);
                    } else {
                        tracker.value = change.newValue;
                    }
                    if (doSet) {
                        overrideTracker.set(baseName, tracker);
                    }
                }
            }
            for (const [baseName, tracker] of overrideTracker.entries()) {
                const configuredValue = tracker.value as T[typeof baseName];
                const validatedValue = this.ensureValid(baseName, () => configuredValue, true);
                if (baseName in changes && this.isRelevantChange(changes[baseName])) {
                    const { domain, oldValue, preferenceName, scope } = changes[baseName];
                    this.fireChangeEvent(this.buildNewChangeEvent({ domain, oldValue, preferenceName, scope, newValue: validatedValue }));
                }
                for (const override of tracker.overrides) {
                    const name = this.preferences.overridePreferenceName(override);
                    const { domain, oldValue, preferenceName, scope } = changes[name];
                    const newValue = changes[name].newValue === configuredValue ? validatedValue : this.ensureValid(name, () => changes[name].newValue, true);
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
        if (!isChange && this.validPreferences.has(preferenceName)) {
            return this.validPreferences.get(preferenceName) as T[K];
        }
        const candidate = getCandidate();
        const valid = this.validator.validateByName(preferenceName, candidate) as T[K];
        this.validPreferences.set(preferenceName, valid);
        return valid;
    }

    override dispose(): void {
        super.dispose();
        if (this.options.isDisposable) {
            this.validPreferences.clear();
        }
    }
}
