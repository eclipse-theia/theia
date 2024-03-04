// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from 'inversify';
import { isThenable } from '../common/promise-util';
import { CancellationToken, CancellationTokenSource, Disposable, Emitter, Event } from '../common';
import { TernarySearchTree } from '../common/ternary-search-tree';
import URI from '../common/uri';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// some code copied and modified from https://github.com/microsoft/vscode/blob/1.52.1/src/vs/workbench/services/decorations/browser/decorationsService.ts#L24-L23

export interface DecorationsProvider {
    readonly onDidChange: Event<URI[]>;
    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined;
}

export interface Decoration {
    readonly weight?: number;
    readonly colorId?: string;
    readonly letter?: string;
    readonly tooltip?: string;
    readonly bubble?: boolean;
}

export interface ResourceDecorationChangeEvent {
    affectsResource(uri: URI): boolean;
}
export const DecorationsService = Symbol('DecorationsService');
export interface DecorationsService {

    readonly onDidChangeDecorations: Event<Map<string, Decoration>>;

    registerDecorationsProvider(provider: DecorationsProvider): Disposable;

    getDecoration(uri: URI, includeChildren: boolean): Decoration[];
}

class DecorationDataRequest {
    constructor(
        readonly source: CancellationTokenSource,
        readonly thenable: Promise<void>,
    ) { }
}

class DecorationProviderWrapper {

    readonly data: TernarySearchTree<URI, DecorationDataRequest | Decoration | undefined>;
    readonly decorations: Map<string, Decoration> = new Map();
    private readonly disposable: Disposable;

    constructor(
        readonly provider: DecorationsProvider,
        readonly onDidChangeDecorationsEmitter: Emitter<Map<string, Decoration>>
    ) {

        this.data = TernarySearchTree.forUris<DecorationDataRequest | Decoration | undefined>(true);

        this.disposable = this.provider.onDidChange(async uris => {
            this.decorations.clear();
            if (!uris) {
                this.data.clear();
            } else {
                for (const uri of uris) {
                    this.fetchData(uri);
                    const decoration = await provider.provideDecorations(uri, CancellationToken.None);
                    if (decoration) {
                        this.decorations.set(uri.toString(), decoration);
                    }
                }
            }
            this.onDidChangeDecorationsEmitter.fire(this.decorations);
        });
    }

    dispose(): void {
        this.disposable.dispose();
        this.data.clear();
    }

    knowsAbout(uri: URI): boolean {
        return !!this.data.get(uri) || Boolean(this.data.findSuperstr(uri));
    }

    getOrRetrieve(uri: URI, includeChildren: boolean, callback: (data: Decoration, isChild: boolean) => void): void {

        let item = this.data.get(uri);

        if (item === undefined) {
            // unknown -> trigger request
            item = this.fetchData(uri);
        }

        if (item && !(item instanceof DecorationDataRequest)) {
            // found something (which isn't pending anymore)
            callback(item, false);
        }

        if (includeChildren) {
            // (resolved) children
            const iter = this.data.findSuperstr(uri);
            if (iter) {
                let next = iter.next();
                while (!next.done) {
                    const value = next.value;
                    if (value && !(value instanceof DecorationDataRequest)) {
                        callback(value, true);
                    }
                    next = iter.next();
                }
            }
        }
    }

    private fetchData(uri: URI): Decoration | undefined {

        // check for pending request and cancel it
        const pendingRequest = this.data.get(uri);
        if (pendingRequest instanceof DecorationDataRequest) {
            pendingRequest.source.cancel();
            this.data.delete(uri);
        }

        const source = new CancellationTokenSource();
        const dataOrThenable = this.provider.provideDecorations(uri, source.token);
        if (!isThenable<Decoration | Promise<Decoration | undefined> | undefined>(dataOrThenable)) {
            // sync -> we have a result now
            return this.keepItem(uri, dataOrThenable);

        } else {
            // async -> we have a result soon
            const request = new DecorationDataRequest(source, Promise.resolve(dataOrThenable).then(data => {
                if (this.data.get(uri) === request) {
                    this.keepItem(uri, data);
                }
            }).catch(err => {
                if (!(err instanceof Error && err.name === 'Canceled' && err.message === 'Canceled') && this.data.get(uri) === request) {
                    this.data.delete(uri);
                }
            }));

            this.data.set(uri, request);
            return undefined;
        }
    }

    private keepItem(uri: URI, data: Decoration | undefined): Decoration | undefined {
        const deco = data ? data : undefined;
        this.data.set(uri, deco);
        return deco;
    }
}

@injectable()
export class DecorationsServiceImpl implements DecorationsService {

    private readonly data: DecorationProviderWrapper[] = [];
    private readonly onDidChangeDecorationsEmitter = new Emitter<Map<string, Decoration>>();

    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

    dispose(): void {
        this.onDidChangeDecorationsEmitter.dispose();
    }

    registerDecorationsProvider(provider: DecorationsProvider): Disposable {

        const wrapper = new DecorationProviderWrapper(provider, this.onDidChangeDecorationsEmitter);
        this.data.push(wrapper);

        return Disposable.create(() => {
            // fire event that says 'yes' for any resource
            // known to this provider. then dispose and remove it.
            this.data.splice(this.data.indexOf(wrapper), 1);
            this.onDidChangeDecorationsEmitter.fire(new Map<string, Decoration>());
            wrapper.dispose();
        });
    }

    getDecoration(uri: URI, includeChildren: boolean): Decoration[] {
        const data: Decoration[] = [];
        let containsChildren: boolean = false;
        for (const wrapper of this.data) {
            wrapper.getOrRetrieve(uri, includeChildren, (deco, isChild) => {
                if (!isChild || deco.bubble) {
                    data.push(deco);
                    containsChildren = isChild || containsChildren;
                }
            });
        }
        return data;
    }
}
