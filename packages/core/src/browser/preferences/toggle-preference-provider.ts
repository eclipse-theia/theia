// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { URI } from '../../common';
import { PreferenceProvider, PreferenceProviderDataChanges, PreferenceResolveResult } from './preference-provider';

/**
 * Allows enabling/disabling a {@link PreferenceProvider} by wrapping it.
 */
export class TogglePreferenceProvider extends PreferenceProvider {

    #enabled: boolean;

    constructor(
        enabled: boolean,
        protected provider: PreferenceProvider
    ) {
        super();
        this.#enabled = enabled;
        this.provider.ready.then(() => this._ready.resolve());
        this.provider.onDidPreferencesChanged(this.handleDidPreferencesChanged, this, this.toDispose);
    }

    get enabled(): boolean {
        return this.#enabled;
    }

    set enabled(value: boolean) {
        if (this.#enabled !== value) {
            this.#enabled = value;
            this.onDidPreferencesChangedEmitter.fire({});
        }
    }

    getPreferences(resourceUri?: string): { [p: string]: any; } {
        if (this.enabled) {
            return this.provider.getPreferences(resourceUri);
        }
        return {};
    }

    async setPreference(key: string, value: any, resourceUri?: string): Promise<boolean> {
        if (this.enabled) {
            return this.provider.setPreference(key, value, resourceUri);
        }
        return false;
    }

    override get<T>(preferenceName: string, resourceUri?: string): T | undefined {
        if (this.enabled) {
            return this.provider.get<T>(preferenceName, resourceUri);
        }
    }

    override resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        if (this.enabled) {
            return this.provider.resolve<T>(preferenceName, resourceUri);
        }
        return {};
    }

    override getDomain(): string[] | undefined {
        if (this.enabled) {
            return this.provider.getDomain();
        }
    }

    override getConfigUri(resourceUri?: string, sectionName?: string): URI | undefined {
        if (this.enabled) {
            return this.provider.getConfigUri(resourceUri, sectionName);
        }
    }

    override getContainingConfigUri?(resourceUri?: string, sectionName?: string): URI | undefined {
        if (this.enabled) {
            return this.provider.getContainingConfigUri?.(resourceUri, sectionName);
        }
    }

    override dispose(): void {
        super.dispose();
        this.provider.dispose();
    }

    protected handleDidPreferencesChanged(event: PreferenceProviderDataChanges): void {
        if (this.enabled) {
            this.onDidPreferencesChangedEmitter.fire(event);
        }
    }
}
