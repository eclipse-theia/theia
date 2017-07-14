/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify'
import { ContributionProvider } from '@theia/core/lib/common'
import { PreferenceServer, PreferenceClient } from './preference-protocol';

export const PreferenceContribution = Symbol("PreferenceContribution");

export interface Preference {
    /**
     * name of preference (unique or resolved to unique later)
     */
    name: string
    defaultValue?: any
    description?: string
}

export interface PreferenceContribution {
    readonly preferences: Preference[];
}

@injectable()
export class DefaultPreferenceServer implements PreferenceServer {

    protected readonly preferences = new Map<string, any>();

    constructor(
        @inject(ContributionProvider) @named(PreferenceContribution)
        protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>
    ) {
        for (const { preferences } of preferenceContributions.getContributions()) {
            for (const preference of preferences) {
                this.preferences.set(preference.name, preference);
            }
        }
    }

    dispose(): void { /* no-op */ }

    has(preferenceName: string): Promise<boolean> {
        if (this.preferences.has(preferenceName)) {
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        const preference = this.preferences.get(preferenceName)
        return Promise.resolve(!!preference ? preference.defaultValue : undefined);
    }

    setClient(client: PreferenceClient | undefined) { /* no-op */ }

    onReady(): Promise<void> { return Promise.resolve(undefined) };
}