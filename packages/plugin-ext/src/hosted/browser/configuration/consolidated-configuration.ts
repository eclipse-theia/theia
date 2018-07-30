/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { injectable, inject } from 'inversify';
import { PreferenceServiceImpl, PreferenceScope, PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { Emitter, DisposableCollection, ILogger } from '@theia/core/lib/common';
// import { ConfigurationChange, ConfigurationModel } from '../../../api/plugin-api';
import { ConfigurationModel } from '../configuration/configuration-model';
import { PluginConfigurationProvider } from '../plugin-configuration';
import { ConfigurationTarget } from '../../../plugin/types-impl';
import { IConfiguration } from '@theia/plugin-ext/src/hosted/node/cotributions/contributions';

@injectable()
export class ConsolidatedConfigurationRegistry {

    // todo move follow fields to the separate object with own logic ?
    // private prefs: ConfigurationModel = { };
    // temproray it's monolit for all plugins...
    // private consolidatePluginsPrefs: ConfigurationModel = { };
    // extension chema shoud be stored too...
    // private extensionPrefs: ConfigurationModel = {};

    protected readonly toDispose = new DisposableCollection();
    // protected readonly onConfigurationChangedEmitter = new Emitter<ConfigurationChange[]>();

    // readonly onConfigurationChanged = this.onConfigurationChangedEmitter.event;

    protected readonly onConfigurationChangedEmitter = new Emitter<ConfigurationModel>();

    readonly onConfigurationChanged = this.onConfigurationChangedEmitter.event;

    private model: ConfigurationModel = new ConfigurationModel();

    constructor(
        @inject(PreferenceServiceImpl) private prefService: PreferenceServiceImpl, // it's bad to use implementation
        @inject(PluginConfigurationProvider) private pluginConfProvider: PluginConfigurationProvider,
        @inject(ILogger) private readonly logger: ILogger,
        // todo implement returning default configuration
        @inject(PreferenceSchemaProvider) private readonly prefChemaProvider: PreferenceSchemaProvider,
    ) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>3');

        // prefService.ready.then(() => {
        //     this.prefs = this.prefService.getPreferences();
        //     this.extensionPrefs = this.prefChemaProvider.getSchema().properties;
        //     console.log("Consolidated configuration.... ", this.getConsolidatedConfig());

        //     this.prefService.onPreferenceChanged(prefChange => {
        //         console.log('pref changed!!!');
        //         this.prefs = this.prefService.getPreferences(); // !!!

        //         const confChange: ConfigurationChange = { section: prefChange.preferenceName, value: prefChange.newValue };
        //         this.onConfigurationChangedEmitter.fire([confChange]);
        //     });
        // });

        this.pluginConfProvider.onPluginConfigurationChanged(pluginPref => {
            // const confChanges: ConfigurationChange[] = [];

            // tslint:disable-next-line:forin
            for (const prefName in pluginPref.properties) {
                const value = pluginPref.properties[prefName];
                console.log("Value ", value);
                this.model.setValue(prefName, value);
            //     // todo don't throw event twice. If conf was changed to the same value
            //     if (this.validatePrefKey(prefName)) {
            //         (this.consolidatePluginsPrefs as any)[prefName] = pluginPref.properties[prefName];
            //         const confChange: ConfigurationChange = { section: prefName, value: pluginPref.properties[prefName] };
            //         confChanges.push(confChange);
            //     } else {
            //         logger.warn(`Configuration key: is already registered ${prefName}`);
            //     }
            }
            // this.onConfigurationChangedEmitter.fire(confChanges);
            console.log("Set value to the model ", this.model);
            this.onConfigurationChangedEmitter.fire(this.model);
        });

        // todo fire configuration changed event for another cases... workspace folder, or workspace... in memory conf...
        // this.toDispose.push(this.onConfigurationChangedEmitter);
    }

    // todo validate more deeply...
    // private validatePrefKey(prefKey: string): boolean {
    //     const prefValue = (this.prefs as any)[prefKey] || (this.consolidatePluginsPrefs as any)[prefKey];
    //     return !prefValue ? true : false;
    // }

    async updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any) {
        const scope = this.parseConfigurationTarget(target);
        await this.prefService.set(key, value, scope);

        // this.prefs = this.prefService.getPreferences();
        return Promise.resolve();
    }

    async removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string) {
        const scope = this.parseConfigurationTarget(target);
        await this.prefService.set(key, undefined, scope);

        // this.prefs = this.prefService.getPreferences();
        return Promise.resolve();
    }

    getConsolidatedConfig(): ConfigurationModel {
        // const consolidatedConf: ConfigurationModel = {
            // ...this.consolidatePluginsPrefs,
            // ...this.extensionPrefs,
            // ...this.prefs,
        // };
        // return consolidatedConf;
        return this.model;
    }

    /**
     * Convert configuration target to the Preferences scope.
     */
    private parseConfigurationTarget(confTarget: boolean | ConfigurationTarget | undefined): PreferenceScope {
        switch (confTarget) {
            case void 0: // undefined case
            case null:
            case false: // Todo improve logic when preference scope for "workspace folder" will be implemented.
            case ConfigurationTarget.Workspace:
                return PreferenceScope.Workspace;

            case true:
            case ConfigurationTarget.Global:
                return PreferenceScope.User;

            default:
                throw new Error("Unexpected value.");
        }
    }

    // private registerProperties(configuration: IConfiguration): void {

    // }

    private getDefaultValue(type: string): any {
        switch (type) {
            case 'boolean':
                return false;
            case 'integer':
            case 'number':
                return 0;
            case 'string':
                return '';
            case 'array':
                return [];
            case 'object':
                return {};
            default:
                return null;
        }
    }
}
