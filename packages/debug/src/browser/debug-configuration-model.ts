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

import * as jsoncparser from 'jsonc-parser';
import URI from '@theia/core/lib/common/uri';
import { Resource, Disposable, DisposableCollection, Emitter, Event } from '@theia/core';
import { DebugConfiguration } from '../common/debug-common';

export class DebugConfigurationModel implements Disposable {

    protected content: string | undefined;
    protected json: DebugConfigurationModel.JsonContent;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter
    );

    constructor(
        readonly provider: string,
        readonly workspaceFolderUri: string | undefined,
        protected readonly resource: Resource
    ) {
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(() => this.reconcile()));
        }
        this.json = this.parseConfigurations();
        this.reconcile();
    }

    get uri(): URI {
        return this.resource.uri;
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

    async reconcile(): Promise<void> {
        this.content = await this.readContents();
        this.json = this.parseConfigurations();
        this.onDidChangeEmitter.fire(undefined);
    }
    protected async readContents(): Promise<string | undefined> {
        try {
            return await this.resource.readContents();
        } catch (e) {
            return undefined;
        }
    }
    protected parseConfigurations(): DebugConfigurationModel.JsonContent {
        const configurations: DebugConfiguration[] = [];
        if (!this.content) {
            return {
                version: '0.2.0',
                configurations
            };
        }
        const json: Partial<{
            configurations: Partial<DebugConfiguration>[]
        }> | undefined = jsoncparser.parse(this.content, undefined, { disallowComments: false });
        if (json && 'configurations' in json) {
            if (Array.isArray(json.configurations)) {
                json.configurations.filter(DebugConfiguration.is);
                for (const configuration of json.configurations) {
                    if (DebugConfiguration.is(configuration)) {
                        configurations.push(configuration);
                    }
                }
            }
        }
        return {
            ...json,
            configurations
        };
    }

    get exists(): boolean {
        return this.content !== undefined;
    }
    async save(content: string): Promise<void> {
        await Resource.save(this.resource, { content });
        this.reconcile();
    }
}
export namespace DebugConfigurationModel {
    export interface JsonContent {
        configurations: DebugConfiguration[]
        // tslint:disable-next-line:no-any
        [property: string]: any
    }
}
