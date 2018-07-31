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
import { ConfigurationChange } from '../../../common';
import { Emitter } from '@theia/core/lib/common';
import { ConfigurationTarget } from '../../../plugin/types-impl';

 @injectable()
 export class UserConfigurationRegistry {

    private userConfMap: Map<String, any> = new Map();
    protected readonly onUserConfigurationChangedEmitter = new Emitter<ConfigurationChange[]>();
    readonly onUserConfigurationChanged = this.onUserConfigurationChangedEmitter.event;

    constructor(
        @inject(PreferenceServiceImpl) private readonly prefService: PreferenceServiceImpl, // it's bad to use implementation
    ) {
        prefService.ready.then(() => {
            const prefs = this.prefService.getPreferences();
            Object.keys(prefs).forEach((prefName) => {
                const value = prefs[prefName];
                this.userConfMap.set(prefName, value);
            });

            this.prefService.onPreferenceChanged(prefChange => {
                this.userConfMap.set(prefChange.preferenceName, prefChange.newValue);

                const confChange: ConfigurationChange = { section: prefChange.preferenceName, value: prefChange.newValue };
                this.onUserConfigurationChangedEmitter.fire([confChange]);
            });
        });
    }

    async updateConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string, value: any) {
        const scope = this.parseConfigurationTarget(target);
        await this.prefService.set(key, value, scope);

        const updatedValue = this.prefService.get(key);
        this.userConfMap.set(key, updatedValue);

        // todo throw event ?

        return Promise.resolve();
    }

    async removeConfigurationOption(target: boolean | ConfigurationTarget | undefined, key: string) {
        const scope = this.parseConfigurationTarget(target);
        await this.prefService.set(key, undefined, scope);

        const updatedValue = this.prefService.get(key);
        this.userConfMap.set(key, updatedValue);

        // todo throw event ?

        return Promise.resolve();
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
 }
