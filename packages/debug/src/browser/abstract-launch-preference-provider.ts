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

import { injectable, postConstruct } from 'inversify';
import { PreferenceScope, PreferenceProvider } from '@theia/core/lib/browser';
import { Emitter, Event } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { DisposableCollection } from '@theia/core';
import { Disposable } from '@theia/core';

export interface GlobalLaunchConfig {
    version: string;
    compounds?: LaunchCompound[];
    configurations: LaunchConfig[];
}

export namespace GlobalLaunchConfig {
    /* tslint:disable-next-line:no-any */
    export function is(data: any): data is GlobalLaunchConfig {
        return !data || (!!data.version && (!data.compounds || Array.isArray(data.compounds)) && Array.isArray(data.configurations));
    }
}

export interface LaunchConfig {
    type: string;
    request: string;
    name: string;

    /* tslint:disable-next-line:no-any */
    [field: string]: any;
}

export interface LaunchCompound {
    name: string;
    configurations: (string | { name: string, folder: string })[];
}

export const LaunchPreferenceProvider = Symbol('LaunchConfigurationProvider');
export interface LaunchPreferenceProvider {

    readonly onDidLaunchChanged: Event<void>;

    ready: Promise<void>;

    getConfigurationNames(withCompounds: boolean, resourceUri?: string): string[];

}

export const FolderLaunchProviderOptions = Symbol('FolderLaunchProviderOptions');
export interface FolderLaunchProviderOptions {
    folderUri: string;
}

export const LaunchProviderProvider = Symbol('LaunchProviderProvider');
export type LaunchProviderProvider = (scope: PreferenceScope) => LaunchPreferenceProvider;

@injectable()
export abstract class AbstractLaunchPreferenceProvider implements LaunchPreferenceProvider, Disposable {

    protected readonly onDidLaunchChangedEmitter = new Emitter<void>();
    readonly onDidLaunchChanged: Event<void> = this.onDidLaunchChangedEmitter.event;

    protected preferences: GlobalLaunchConfig | undefined;

    protected _ready: Deferred<void> = new Deferred<void>();

    protected readonly toDispose = new DisposableCollection();

    protected readonly preferenceProvider: PreferenceProvider;

    @postConstruct()
    protected init(): void {
        this.preferenceProvider.ready
            .then(() => this._ready.resolve())
            .catch(() => this._ready.resolve());

        this.updatePreferences();
        if (this.preferences !== undefined) {
            this.emitLaunchChangedEvent();
        }

        this.toDispose.push(this.onDidLaunchChangedEmitter);
        this.toDispose.push(
            this.preferenceProvider.onDidInvalidPreferencesRead(prefs => {
                if (!prefs || !GlobalLaunchConfig.is(prefs.launch)) {
                    return;
                }
                if (!prefs.launch && !this.preferences) {
                    return;
                }
                this.preferences = prefs.launch;
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
        const prefs = this.preferenceProvider.getPreferences();
        if (GlobalLaunchConfig.is(prefs.launch)) {
            this.preferences = prefs.launch;
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

    getConfigurationNames(withCompounds = true, resourceUri?: string): string[] {
        const config = this.preferences;
        if (!config) {
            return [];
        }

        const names = config.configurations
            .filter(launchConfig => launchConfig && typeof launchConfig.name === 'string')
            .map(launchConfig => launchConfig.name);
        if (withCompounds && config.compounds) {
            const compoundNames = config.compounds
                .filter(compoundConfig => typeof compoundConfig.name === 'string' && compoundConfig.configurations && compoundConfig.configurations.length)
                .map(compoundConfig => compoundConfig.name);
            names.push(...compoundNames);
        }

        return names;
    }

}
