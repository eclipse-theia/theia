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
import { injectable, inject } from 'inversify';
import { PreferenceServiceImpl, PreferenceScope } from '@theia/core/lib/browser';
import { Emitter, DisposableCollection } from '@theia/core/lib/common';
import { ConfigurationChange, ConfigurationModel } from '../../../api/plugin-api';
import { PluginConfigurationProvider } from '../plugin-configuration';
import { ConfigurationTarget } from '@theia/plugin';
import { retro } from '@phosphor/algorithm';
import { Exception } from 'handlebars';

// create default configuration the same like in the vscode....? in the separated file
@injectable()
export class ConsolidatedConfigurationRegistry {

    private readonly consolidatedConf: ConfigurationModel = {properties: {}};
    protected readonly toDispose = new DisposableCollection();
    protected readonly onConfigurationChangedEmitter = new Emitter<ConfigurationChange>();

    readonly onConfigurationChanged = this.onConfigurationChangedEmitter.event;

    constructor(
        @inject(PreferenceServiceImpl) private prefService: PreferenceServiceImpl, // it's bad to use implementation
        @inject(PluginConfigurationProvider) private pluginConfProvider: PluginConfigurationProvider,
        // todo implement returning default configuration
        // @inject(PreferenceSchemaProvider) private readonly prefChemaProvider: PreferenceSchemaProvider,
    ) {
        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>');
        // todo apply handler for add new plugin
        this.prefService.onPreferenceChanged(e => {
            console.log('pref changed!!!');
            this.prefService.getPreferences();

            this.consolidatedConf.properties = {
                ...this.consolidatedConf.properties,
                ...this.prefService.getPreferences()
            };
            const confChange: ConfigurationChange = {section: e.preferenceName, value: e.newValue};
            this.onConfigurationChangedEmitter.fire(confChange);
        });

        this.pluginConfProvider.onPluginConfigurationChanged(e => {
            this.consolidatedConf.properties = {
                ...this.consolidatedConf.properties,
                ...e.properties
            };
            for (const confName in this.consolidatedConf.properties) {
                // todo don't throw event twice. If conf was changed to the same value
                if (this.consolidatedConf.properties.hasOwnProperty(confName)) {
                    const confChange: ConfigurationChange = {section: confName, value: this.consolidatedConf.properties[confName]};
                    // event should throw few properties, not only single props
                    this.onConfigurationChangedEmitter.fire(confChange);
                }
            }
        });

        // todo fire configuration changed event for another cases... workspace folder, or workspace... in memory conf...
        console.log("Consolidated configuration.... ", this.consolidatedConf);

        this.toDispose.push(this.onConfigurationChangedEmitter);
    }

    // todo in memory configs to change to change properties for plugins

    // getValue(section: string) {
    // }

    updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, value, scope);
    }

    removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string): PromiseLike<void> {
        const scope = this.parseConfigurationTarget(target);
        return this.preferenceService.set(key, undefined, scope);
    }

    getConsolidatedConfig(): ConfigurationModel {
        return this.consolidatedConf;
    }

    /**
     * Convert configuration target to the Preferences scope.
     */
    private parseConfigurationTarget(confTarget: boolean | ConfigurationTarget | undefined): PreferenceScope {
        switch(confTarget) {
            case void 0: // undefined case
            case null: 
            case false: // Todo improve logic when preference scope for "workspace folder" will be implemented.
            case ConfigurationTarget.Workspace:
                return PreferenceScope.Workspace;

            case true:
            case ConfigurationTarget.Global:
                return PreferenceScope.User;

            default:
                throw new Exception("Unexpected value.");
        }
    }
}
