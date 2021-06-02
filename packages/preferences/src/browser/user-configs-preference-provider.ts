/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PreferenceProvider, PreferenceResolveResult } from '@theia/core/lib/browser/preferences/preference-provider';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { UserPreferenceProvider, UserPreferenceProviderFactory } from './user-preference-provider';

/**
 * Binds together preference section prefs providers for user-level preferences.
 */
@injectable()
export class UserConfigsPreferenceProvider extends PreferenceProvider {

    @inject(UserPreferenceProviderFactory)
    protected readonly providerFactory: UserPreferenceProviderFactory;

    @inject(PreferenceConfigurations)
    protected readonly configurations: PreferenceConfigurations;

    protected readonly providers = new Map<string, UserPreferenceProvider>();

    @postConstruct()
    protected async init(): Promise<void> {
        this.createProviders();

        const readyPromises: Promise<void>[] = [];
        for (const provider of this.providers.values()) {
            readyPromises.push(provider.ready.catch(e => console.error(e)));
        }
        Promise.all(readyPromises).then(() => this._ready.resolve());
    }

    protected createProviders(): void {
        for (const configName of [...this.configurations.getSectionNames(), this.configurations.getConfigName()]) {
            const sectionUri = UserStorageUri.resolve(configName + '.json');
            const sectionKey = sectionUri.toString();
            if (!this.providers.has(sectionKey)) {
                const provider = this.createProvider(sectionUri, configName);
                this.providers.set(sectionKey, provider);
            }
        }
    }

    getConfigUri(resourceUri?: string, sectionName: string = this.configurations.getConfigName()): URI | undefined {
        for (const provider of this.providers.values()) {
            const configUri = provider.getConfigUri(resourceUri);
            if (configUri && this.configurations.getName(configUri) === sectionName) {
                return configUri;
            }
        }
        return undefined;
    }

    resolve<T>(preferenceName: string, resourceUri?: string): PreferenceResolveResult<T> {
        const result: PreferenceResolveResult<T> = {};
        for (const provider of this.providers.values()) {
            const { value, configUri } = provider.resolve<T>(preferenceName, resourceUri);
            if (configUri && value !== undefined) {
                result.configUri = configUri;
                result.value = PreferenceProvider.merge(result.value as any, value as any) as any;
            }
        }
        return result;
    }

    getPreferences(resourceUri?: string): { [p: string]: any } {
        let result = {};
        for (const provider of this.providers.values()) {
            const preferences = provider.getPreferences();
            result = PreferenceProvider.merge(result, preferences) as any;
        }
        return result;
    }

    async setPreference(preferenceName: string, value: any, resourceUri?: string): Promise<boolean> {
        const sectionName = preferenceName.split('.', 1)[0];
        const configName = this.configurations.isSectionName(sectionName) ? sectionName : this.configurations.getConfigName();

        const providers = this.providers.values();

        for (const provider of providers) {
            if (this.configurations.getName(provider.getConfigUri()) === configName) {
                return provider.setPreference(preferenceName, value, resourceUri);
            }
        }
        return false;
    }

    protected createProvider(uri: URI, sectionName: string): UserPreferenceProvider {
        const provider = this.providerFactory(uri, sectionName);
        this.toDispose.push(provider);
        this.toDispose.push(provider.onDidPreferencesChanged(change => this.onDidPreferencesChangedEmitter.fire(change)));
        return provider;
    }
}
