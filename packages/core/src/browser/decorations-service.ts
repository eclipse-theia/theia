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
    /**
     * Signals that decorations changed for the given resources. Firing `undefined` is a
     * flush event: all previously provided decorations may have changed, cached data is
     * dropped and re-fetched on demand.
     */
    readonly onDidChange: Event<URI[] | undefined>;
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

    /**
     * Fired when decorations changed. The payload maps the string representation of the
     * affected resource URIs to their new decoration. Resources whose decoration was
     * removed are not listed; an empty map signals that an unspecified set of decorations
     * changed (e.g. a provider fired a flush event) - clients should re-query the
     * decorations they display. Change notifications caused by asynchronously resolving
     * decoration requests are batched: many resolutions result in a single event.
     */
    readonly onDidChangeDecorations: Event<Map<string, Decoration>>;

    registerDecorationsProvider(provider: DecorationsProvider): Disposable;

    getDecoration(uri: URI, includeChildren: boolean): Decoration[];
}

class DecorationDataRequest {
    constructor(
        readonly source: CancellationTokenSource,
        readonly thenable: Promise<void>,
        /** Value cached before this request started, to detect removals when it resolves. */
        // eslint-disable-next-line no-null/no-null
        readonly previous: Decoration | null | undefined,
    ) { }
}

class DecorationProviderWrapper {

    /**
     * Cached provider results. Three states per resource: no entry means the resource was
     * never fetched, a `null` entry means it was fetched and has no decoration, and a
     * {@link DecorationDataRequest} entry means a fetch is in flight. Distinguishing
     * "known to be undecorated" from "unknown" is what keeps on-demand queries from
     * re-fetching undecorated resources over and over.
     */
    // eslint-disable-next-line no-null/no-null
    readonly data: TernarySearchTree<URI, DecorationDataRequest | Decoration | null>;
    private readonly disposable: Disposable;

    constructor(
        readonly provider: DecorationsProvider,
        /** Reports a changed decoration, or `undefined` when the decoration was removed. */
        private readonly notifyDecorationChange: (uri: URI, decoration: Decoration | undefined) => void,
        /** Reports that all decorations of this provider may have changed. */
        private readonly notifyFlush: () => void
    ) {

        // eslint-disable-next-line no-null/no-null
        this.data = TernarySearchTree.forUris<DecorationDataRequest | Decoration | null>(true);

        this.disposable = this.provider.onDidChange(uris => {
            if (!uris) {
                // flush event -> drop all data to be re-fetched on demand
                this.data.clear();
                this.notifyFlush();
            } else {
                // selective changes -> re-fetch the given resources
                for (const uri of uris) {
                    this.fetchData(uri);
                }
            }
        });
    }

    dispose(): void {
        this.disposable.dispose();
        this.data.clear();
    }

    knowsAbout(uri: URI): boolean {
        return this.data.get(uri) !== undefined || Boolean(this.data.findSuperstr(uri));
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

    // eslint-disable-next-line no-null/no-null
    private fetchData(uri: URI): Decoration | null | undefined {

        // check for pending request and cancel it, keeping the last settled value
        const existing = this.data.get(uri);
        const previous = existing instanceof DecorationDataRequest ? existing.previous : existing;
        if (existing instanceof DecorationDataRequest) {
            existing.source.cancel();
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
            }), previous);

            this.data.set(uri, request);
            return undefined;
        }
    }

    // eslint-disable-next-line no-null/no-null
    private keepItem(uri: URI, data: Decoration | undefined): Decoration | null {
        // eslint-disable-next-line no-null/no-null
        const deco = data ? data : null;
        const old = this.data.set(uri, deco);
        const previous = old instanceof DecorationDataRequest ? old.previous : old;
        if (deco || previous) {
            // only notify when something actually changed: a decoration appeared or
            // changed, or a previously known decoration was removed. Resources resolving
            // to "no decoration" from an unknown or pending state stay silent so that
            // on-demand queries of undecorated resources cause no render churn.
            this.notifyDecorationChange(uri, deco ?? undefined);
        }
        return deco;
    }
}

@injectable()
export class DecorationsServiceImpl implements DecorationsService {

    private readonly data: DecorationProviderWrapper[] = [];
    private readonly onDidChangeDecorationsEmitter = new Emitter<Map<string, Decoration>>();

    /**
     * Accumulates decoration changes until the batched {@link onDidChangeDecorations}
     * event fires. `undefined` values mark removed decorations.
     */
    private readonly pendingChanges = new Map<string, Decoration | undefined>();
    private pendingFlush = false;
    private fireSoonHandle: ReturnType<typeof setTimeout> | undefined;

    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

    dispose(): void {
        if (this.fireSoonHandle !== undefined) {
            clearTimeout(this.fireSoonHandle);
            this.fireSoonHandle = undefined;
        }
        this.onDidChangeDecorationsEmitter.dispose();
    }

    registerDecorationsProvider(provider: DecorationsProvider): Disposable {

        const wrapper = new DecorationProviderWrapper(
            provider,
            (uri, decoration) => this.notifyDecorationChange(uri, decoration),
            () => this.notifyFlush()
        );
        this.data.push(wrapper);

        return Disposable.create(() => {
            // dispose and remove the provider, then signal that
            // any of its previously provided decorations may be gone.
            this.data.splice(this.data.indexOf(wrapper), 1);
            wrapper.dispose();
            this.notifyFlush();
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

    protected notifyDecorationChange(uri: URI, decoration: Decoration | undefined): void {
        this.pendingChanges.set(uri.toString(), decoration);
        this.fireSoon();
    }

    protected notifyFlush(): void {
        this.pendingFlush = true;
        this.fireSoon();
    }

    protected fireSoon(): void {
        if (this.fireSoonHandle === undefined) {
            this.fireSoonHandle = setTimeout(() => this.fireChangeEvent(), 0);
        }
    }

    protected fireChangeEvent(): void {
        this.fireSoonHandle = undefined;
        const event = new Map<string, Decoration>();
        if (!this.pendingFlush) {
            for (const [uri, decoration] of this.pendingChanges) {
                if (decoration) {
                    event.set(uri, decoration);
                }
            }
        }
        this.pendingFlush = false;
        this.pendingChanges.clear();
        this.onDidChangeDecorationsEmitter.fire(event);
    }
}
