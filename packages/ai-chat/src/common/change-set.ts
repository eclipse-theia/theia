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

import { ArrayUtils, Disposable, Emitter, Event, URI } from '@theia/core';

export interface ChangeSetElement {
    readonly uri: URI;

    onDidChange?: Event<void>
    readonly name?: string;
    readonly icon?: string;
    readonly additionalInfo?: string;

    readonly state?: 'pending' | 'applied' | 'stale';
    readonly type?: 'add' | 'modify' | 'delete';
    readonly data?: { [key: string]: unknown };

    /** Called when an element is shown in the UI */
    onShow?(): void;
    /** Called when an element is hidden in the UI */
    onHide?(): void;
    open?(): Promise<void>;
    openChange?(): Promise<void>;
    apply?(): Promise<void>;
    revert?(): Promise<void>;
    dispose?(): void;
}

export interface ChatUpdateChangeSetEvent {
    kind: 'updateChangeSet';
    elements?: ChangeSetElement[];
    title?: string;
}

export interface ChangeSetChangeEvent {
    title?: string;
    added?: URI[],
    removed?: URI[],
    modified?: URI[],
    /** Fired when only the state of a given element changes, not its contents */
    state?: URI[],
}

export interface ChangeSet extends Disposable {
    onDidChange: Event<ChatUpdateChangeSetEvent>;
    readonly title: string;
    setTitle(title: string): void;
    getElements(): ChangeSetElement[];
    /**
     * Find an element by URI.
     * @param uri The URI to look for.
     * @returns The element with the given URI, or undefined if not found.
     */
    getElementByURI(uri: URI): ChangeSetElement | undefined;
    /** @returns true if addition produces a change; false otherwise. */
    addElements(...elements: ChangeSetElement[]): boolean;
    setElements(...elements: ChangeSetElement[]): void;
    /** @returns true if deletion produces a change; false otherwise. */
    removeElements(...uris: URI[]): boolean;
    dispose(): void;
}

export class ChangeSetImpl implements ChangeSet {
    /** @param changeSets ordered from tip to root. */
    static combine(changeSets: Iterable<ChangeSetImpl>): Map<string, ChangeSetElement | undefined> {
        const result = new Map<string, ChangeSetElement | undefined>();
        for (const next of changeSets) {
            next._elements.forEach((value, key) => !result.has(key) && result.set(key, value));
            // Break at the first element whose values were set, not just changed through addition and deletion.
            if (next.hasBeenSet) {
                break;
            }
        }

        return result;
    }

    protected readonly _onDidChangeEmitter = new Emitter<ChatUpdateChangeSetEvent>();
    onDidChange: Event<ChatUpdateChangeSetEvent> = this._onDidChangeEmitter.event;
    protected readonly _onDidChangeContentsEmitter = new Emitter<ChangeSetChangeEvent>();
    onDidChangeContents: Event<ChangeSetChangeEvent> = this._onDidChangeContentsEmitter.event;

    protected hasBeenSet = false;
    protected _elements = new Map<string, ChangeSetElement | undefined>();
    protected _title = 'Suggested Changes';
    get title(): string {
        return this._title;
    }

    constructor(elements: ChangeSetElement[] = []) {
        this.addElements(...elements);
    }

    getElements(): ChangeSetElement[] {
        return ArrayUtils.coalesce(Array.from(this._elements.values()));
    }

    /** Will replace any element that is already present, using URI as identity criterion. */
    addElements(...elements: ChangeSetElement[]): boolean {
        const added: URI[] = [];
        const modified: URI[] = [];
        elements.forEach(element => {
            if (this.doAdd(element)) {
                modified.push(element.uri);
            } else {
                added.push(element.uri);
            }
        });
        this.notifyChange({ added, modified });
        return !!(added.length || modified.length);
    }

    setTitle(title: string): void {
        this._title = title;
        this.notifyChange({ title });
    }

    protected doAdd(element: ChangeSetElement): boolean {
        const id = element.uri.toString();
        const existing = this._elements.get(id);
        existing?.dispose?.();
        this._elements.set(id, element);
        element.onDidChange?.(() => this.notifyChange({ state: [element.uri] }));
        return !!existing;
    }

    setElements(...elements: ChangeSetElement[]): void {
        this.hasBeenSet = true;
        const added = [];
        const modified = [];
        const removed = [];
        const toHandle = new Set(this._elements.keys());
        for (const element of elements) {
            toHandle.delete(element.uri.toString());
            if (this.doAdd(element)) {
                added.push(element.uri);
            } else {
                modified.push(element.uri);
            }
        }
        for (const toDelete of toHandle) {
            const uri = new URI(toDelete);
            if (this.doDelete(uri)) {
                removed.push(uri);
            }
        }
        this.notifyChange({ added, modified, removed });
    }

    removeElements(...uris: URI[]): boolean {
        const removed: URI[] = [];
        for (const uri of uris) {
            if (this.doDelete(uri)) {
                removed.push(uri);
            }
        }
        this.notifyChange({ removed });
        return !!removed.length;
    }

    getElementByURI(uri: URI): ChangeSetElement | undefined {
        return this._elements.get(uri.toString());
    }

    protected doDelete(uri: URI): boolean {
        const id = uri.toString();
        const delendum = this._elements.get(id);
        if (delendum) {
            delendum.dispose?.();
        }
        this._elements.set(id, undefined);
        return !!delendum;
    }

    protected notifyChange(change: ChangeSetChangeEvent): void {
        this._onDidChangeContentsEmitter.fire(change);
        this._onDidChangeEmitter.fire({ kind: 'updateChangeSet', elements: this.getElements(), title: this.title });
    }

    dispose(): void {
        this._onDidChangeEmitter.dispose();
        this._elements.forEach(element => element?.dispose?.());
    }
}
