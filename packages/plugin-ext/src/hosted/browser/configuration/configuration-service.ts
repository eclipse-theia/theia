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
import { UserConfigurationRegistry } from './user-configuration-registry';
import { ExtensionsAndPluginsConfigurationRegistry } from './plugin-extension-configuration-registry';
import { ConfigurationModel } from './configuration-model';
import { addToValueTree } from './configuration';
import { ConfigurationTarget } from '../../../plugin/types-impl';
import { Emitter } from 'vscode-jsonrpc';
import { ConfigurationChange } from '../../../common';

@injectable()
export class ConfigurationService {

    private defaultConfiguration: ConfigurationModel;

    protected readonly onConfigurationChangedEmitter = new Emitter<ConfigurationChange[]>();
    readonly onConfigurationChanged = this.onConfigurationChangedEmitter.event;

    constructor(
        @inject(UserConfigurationRegistry)
        private readonly userConfReg: UserConfigurationRegistry,
        @inject(ExtensionsAndPluginsConfigurationRegistry)
        private readonly extPluginConfReg: ExtensionsAndPluginsConfigurationRegistry) {

        console.log(">>>>>>>>>>>>>Configuration service ");

        // todo apply user prefs to the configuration!!!
        this.defaultConfiguration = new ConfigurationModel();

        this.extPluginConfReg.onConfigurationChanged(properties => {
            this.defaultConfiguration = this.createConfiguration();
            const confChanges: ConfigurationChange[] = [];

            properties.forEach(propertyName => {
                const confValue = this.getConfiguration().getValue(propertyName);
                confChanges.push({ section: propertyName, value: confValue});
            });

            this.onConfigurationChangedEmitter.fire(confChanges);
            console.log("Conf model for now ", this.defaultConfiguration);
        });
    }

    private createConfiguration(): ConfigurationModel {
        const keys: string[] = this.getConfigurationKeys();
        const values = this.getDefaultValues();
        return new ConfigurationModel(values, keys);
    }

    // todo include user pref too.
    getConfiguration(): ConfigurationModel {
        return this.defaultConfiguration;
    }

    async updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any) {
        this.userConfReg.updateConfigurationOption(target, key, value);
    }

    async removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string) {
        this.userConfReg.removeConfigurationOption(target, key);
    }

    private getConfigurationKeys(): string[] {
        return Object.keys(this.extPluginConfReg.getConfigurationProperties());
    }

    private getDefaultValues(): any {
        const valueTreeRoot = {};
        const properties = this.extPluginConfReg.getConfigurationProperties();

        Object.keys(properties).forEach(key => {
            const value = properties[key].default;
            addToValueTree(valueTreeRoot, key, value, message => console.error(`Conflict in default settings: ${message}`));
        });

        return valueTreeRoot;
    }
}
