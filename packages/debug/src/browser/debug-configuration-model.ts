// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { DebugConfiguration } from '../common/debug-common';
import { PreferenceService } from '@theia/core/lib/browser/preferences/preference-service';
import { DebugCompound } from '../common/debug-compound';
import { isObject } from '@theia/core/lib/common';

export class DebugConfigurationModel implements Disposable {

    protected json: DebugConfigurationModel.JsonContent;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter
    );

    constructor(
        readonly workspaceFolderUri: string,
        protected readonly preferences: PreferenceService
    ) {
        this.reconcile();
        this.toDispose.push(this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'launch' && e.affects(workspaceFolderUri)) {
                this.reconcile();
            }
        }));
    }

    get uri(): URI | undefined {
        return this.json.uri;
    }

    dispose(): void {
        this.toDispose.dispose();
    }
    get onDispose(): Event<void> {
        return this.toDispose.onDispose;
    }

    get configurations(): DebugConfiguration[] {
        return this.json.configurations;
    }

    get compounds(): DebugCompound[] {
        return this.json.compounds;
    }

    async reconcile(): Promise<void> {
        this.json = this.parseConfigurations();
        this.onDidChangeEmitter.fire(undefined);
    }
    protected parseConfigurations(): DebugConfigurationModel.JsonContent {
        const configurations: DebugConfiguration[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { configUri, value } = this.preferences.resolve<any>('launch', undefined, this.workspaceFolderUri);
        if (isObject(value) && Array.isArray(value.configurations)) {
            for (const configuration of value.configurations) {
                if (DebugConfiguration.is(configuration)) {
                    configurations.push(configuration);
                }
            }
        }
        const compounds: DebugCompound[] = [];
        if (isObject(value) && Array.isArray(value.compounds)) {
            for (const compound of value.compounds) {
                if (DebugCompound.is(compound)) {
                    compounds.push(compound);
                }
            }
        }
        return { uri: configUri, configurations, compounds };
    }

}
export namespace DebugConfigurationModel {
    export interface JsonContent {
        uri?: URI
        configurations: DebugConfiguration[]
        compounds: DebugCompound[]
    }
}
