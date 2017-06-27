/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContributionProvider } from '../../application/common/contribution-provider'
import { IPreferenceServer } from '../common/preference-protocol'
import { IPreferenceClient } from '../common/preference-protocol'

import { inject, injectable, named } from 'inversify'


export const PreferenceContribution = Symbol("PreferenceContribution");


export interface Preference {
    name: string // name of preference (unique or resolved to unique later)
    defaultValue?: any
    description?: string
}

export interface PreferenceContribution {
    readonly preferences: Preference[]
}

@injectable()
export class DefaultPreferenceServer implements IPreferenceServer {

    protected readonly defaultPrefs: Map<string, any> = new Map<string, any>();

    constructor( @inject(ContributionProvider) @named(PreferenceContribution) protected readonly defaultProviders: ContributionProvider<PreferenceContribution>) {
        const prefContributions: PreferenceContribution[] = defaultProviders.getContributions();

        for (const prefContribution of prefContributions) {
            for (const preference of prefContribution.preferences) {
                this.defaultPrefs.set(preference.name, preference);
            }
        }
    }

    has(preferenceName: string): Promise<boolean> {
        if (this.defaultPrefs.has(preferenceName)) {
            return Promise.resolve(true);
        }
        return Promise.resolve(false);
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        let pref = this.defaultPrefs.get(preferenceName)

        return Promise.resolve(!!pref ? pref.defaultValue : undefined);
    }

    setClient(client: IPreferenceClient | undefined) { }
}