/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { inject, injectable, named, interfaces } from 'inversify';
import { ContributionProvider } from '../../common';
import { PreferenceProvider } from './preference-provider';
import { PreferenceScope } from './preference-service';
import { PreferenceContribution } from './preference-contribution';

export function bindDefaultPreferenceProvider(bind: interfaces.Bind): void {
    bind(PreferenceProvider).to(DefaultPrefrenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Default);
}

@injectable()
export class DefaultPrefrenceProvider extends PreferenceProvider {

    protected readonly preferences: { [name: string]: any } = {};

    constructor(
        @inject(ContributionProvider) @named(PreferenceContribution)
        protected readonly preferenceContributions: ContributionProvider<PreferenceContribution>
    ) {
        super();
        this.preferenceContributions.getContributions().forEach(contrib => {
            for (const prefName of Object.keys(contrib.schema.properties)) {
                this.preferences[prefName] = contrib.schema.properties[prefName].default;
            }
        });
        this._ready.resolve();
    }

    getPreferences(): { [name: string]: any } {
        return this.preferences;
    }

    async setPreference(): Promise<void> {
        throw new Error('Unsupported');
    }

    canProvide(preferenceName: string, resourceUri?: string): number {
        return 0;
    }
}
