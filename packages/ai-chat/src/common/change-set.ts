// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { Disposable, Emitter, Event, URI, generateUuid } from '@theia/core';

export interface ChangeSetElement {
    readonly uri: URI;

    onDidChange?: Event<void>
    readonly name?: string;
    readonly icon?: string;
    readonly additionalInfo?: string;

    readonly state?: 'pending' | 'applied' | 'stale';
    readonly type?: 'add' | 'modify' | 'delete';
    readonly data?: { [key: string]: unknown };

    open?(): Promise<void>;
    openChange?(): Promise<void>;
    apply?(): Promise<void>;
    revert?(): Promise<void>;
    copy?(changeSet: ChangeSet): ChangeSetElement;
    dispose?(): void;
}

export interface ChangeSetChangeEvent {
    added?: URI[],
    removed?: URI[],
    modified?: URI[],
    /** Fired when only the state of a given element changes, not its contents */
    state?: URI[],
}

export interface ChangeSet extends Disposable {
    onDidChange: Event<ChangeSetChangeEvent>;
    readonly title: string;
    readonly id: string;
    getElements(): ChangeSetElement[];
    addElements(...elements: ChangeSetElement[]): void;
    removeElements(...indices: number[]): void;
    copy(): ChangeSet;
    dispose(): void;
}

export class ChangeSetImpl implements ChangeSet {
    protected readonly _onDidChangeEmitter = new Emitter<ChangeSetChangeEvent>();
    onDidChange: Event<ChangeSetChangeEvent> = this._onDidChangeEmitter.event;
    readonly id = generateUuid();

    protected _elements: ChangeSetElement[] = [];

    constructor(public readonly title: string, elements: ChangeSetElement[] = []) {
        this.addElements(...elements);
    }

    getElements(): ChangeSetElement[] {
        return this._elements;
    }

    /** Will replace any element that is already present, using URI as identity criterion. */
    addElements(...elements: ChangeSetElement[]): void {
        const added: URI[] = [];
        const modified: URI[] = [];
        const toDispose: ChangeSetElement[] = [];
        const current = new Map(this.getElements().map((element, index) => [element.uri.toString(), index]));
        elements.forEach(element => {
            const existingIndex = current.get(element.uri.toString());
            if (existingIndex !== undefined) {
                modified.push(element.uri);
                toDispose.push(this._elements[existingIndex]);
                this._elements[existingIndex] = element;
            } else {
                added.push(element.uri);
                this._elements.push(element);
            }
            element.onDidChange?.(() => this.notifyChange({ state: [element.uri] }));
        });
        toDispose.forEach(element => element.dispose?.());
        this.notifyChange({ added, modified });
    }

    removeElements(...indices: number[]): void {
        // From highest to lowest so that we don't affect lower indices with our splicing.
        const sorted = indices.slice().sort((left, right) => left - right);
        const deletions = sorted.flatMap(index => this._elements.splice(index, 1));
        deletions.forEach(deleted => deleted.dispose?.());
        this.notifyChange({ removed: deletions.map(element => element.uri) });
    }

    protected notifyChange(change: ChangeSetChangeEvent): void {
        this._onDidChangeEmitter.fire(change);
    }

    copy(): ChangeSetImpl {
        const copy = new ChangeSetImpl(this.title);
        this._elements.forEach(element => {
            if (element.copy) {
                copy.addElements(element.copy(copy));
            } else {
                copy.addElements(element);
            }
        });
        return copy;
    }

    dispose(): void {
        this._onDidChangeEmitter.dispose();
        this._elements.forEach(element => element.dispose?.());
    }
}
