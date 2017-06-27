/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContributionProvider } from '../../application/common/contribution-provider'
import { IPreferenceServer } from './preference-server'

import { inject, named } from 'inversify'


export const PreferenceContribution = Symbol("PreferenceContribution");


export interface Preference {
    name: string // name of preference (unique or resolved to unique later)
    defaultValue?: any
    description?: string
}

export interface PreferenceContribution {
    readonly preferences: Preference[]
}


export class DefaultPreferenceServer implements IPreferenceServer {

    constructor( @inject(ContributionProvider) @named(PreferenceContribution) protected readonly defaultProviders: ContributionProvider<PreferenceContribution>) {
        const contributions: PreferenceContribution = defaultProviders.getContributions();
    }

    has(preferenceName: string): Promise<boolean> {

    }

    get<T>(preferenceName: string): Promise<T | undefined> {

    }
}