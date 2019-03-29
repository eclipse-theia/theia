/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct, named } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core';
import { Emitter, Event } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { LaunchPreferenceProvider, GlobalLaunchConfig } from './abstract-launch-preference-provider';
import { PreferenceScope, PreferenceProvider } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';

@injectable()
export class FoldersLaunchProvider implements LaunchPreferenceProvider, Disposable {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(PreferenceProvider) @named(PreferenceScope.Folder)
    protected readonly preferenceProvider: PreferenceProvider;

    protected readonly onDidLaunchChangedEmitter = new Emitter<void>();
    readonly onDidLaunchChanged: Event<void> = this.onDidLaunchChangedEmitter.event;

    protected preferencesNotValid: GlobalLaunchConfig | undefined;
    protected preferencesByFolder: Map<string, GlobalLaunchConfig | undefined> = new Map();

    protected _ready: Deferred<void> = new Deferred<void>();

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.preferenceProvider.ready
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        this.updatePreferences();
        if (this.preferencesByFolder.size !== 0) {
            this.emitLaunchChangedEvent();
        }

        this.toDispose.push(this.onDidLaunchChangedEmitter);
        this.toDispose.push(
            this.preferenceProvider.onDidInvalidPreferencesRead(prefs => {
                if (!prefs || !GlobalLaunchConfig.is(prefs.launch)) {
                    return;
                }
                if (!prefs.launch && !this.preferencesNotValid) {
                    return;
                }
                this.preferencesNotValid = prefs.launch;
                this.emitLaunchChangedEvent();
            })
        );
        this.toDispose.push(
            this.preferenceProvider.onDidPreferencesChanged(prefs => {
                if (!prefs || !prefs.launch) {
                    return;
                }
                this.updatePreferences();
                this.emitLaunchChangedEvent();
            })
        );
    }

    protected updatePreferences(): void {
        this.preferencesByFolder.clear();
        this.preferencesNotValid = undefined;
        for (const root of this.workspaceService.tryGetRoots()) {
            const preferences = this.preferenceProvider.getPreferences(root.uri);
            if (GlobalLaunchConfig.is(preferences.launch)) {
                this.preferencesByFolder.set(root.uri, preferences.launch);
            }
        }
    }

    protected emitLaunchChangedEvent(): void {
        this.onDidLaunchChangedEmitter.fire(undefined);
    }

    get ready(): Promise<void> {
        return this._ready.promise;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    getConfigurationNames(withCompounds: boolean, resourceUri: string): string[] {
        let names: string[] = [];

        const launchConfigurations = Array.from(this.preferencesByFolder.values());
        launchConfigurations.push(this.preferencesNotValid);

        for (const config of launchConfigurations) {
            if (!config) {
                continue;
            }

            const configNames = config.configurations
                .filter(launchConfig => launchConfig && typeof launchConfig.name === 'string')
                .map(launchConfig => launchConfig.name);
            if (withCompounds && config.compounds) {
                const compoundNames = config.compounds
                    .filter(compoundConfig => typeof compoundConfig.name === 'string' && compoundConfig.configurations && compoundConfig.configurations.length)
                    .map(compoundConfig => compoundConfig.name);
                configNames.push(...compoundNames);
            }

            names = names.concat(configNames);
        }

        return names;
    }

}
