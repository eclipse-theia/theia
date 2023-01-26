// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ReactNode } from 'react';
import { injectable, unmanaged } from 'inversify';
import { Disposable, DisposableCollection, Emitter, Event, isObject, MaybePromise } from '../../common';
import { TreeWidget } from '../tree';

export interface TreeElement {
    /** default: parent id + position among siblings */
    readonly id?: number | string | undefined
    /** default: true */
    readonly visible?: boolean
    render(host: TreeWidget): ReactNode
    open?(): MaybePromise<any>
}

export interface CompositeTreeElement extends TreeElement {
    /** default: true */
    readonly hasElements?: boolean
    getElements(): MaybePromise<IterableIterator<TreeElement>>
}
export namespace CompositeTreeElement {
    export function is(element: unknown): element is CompositeTreeElement {
        return isObject(element) && 'getElements' in element;
    }
    export function hasElements(element: unknown): element is CompositeTreeElement {
        return is(element) && element.hasElements !== false;
    }
}

@injectable()
export abstract class TreeSource implements Disposable {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    readonly id: string | undefined;
    readonly placeholder: string | undefined;

    constructor(@unmanaged() options: TreeSourceOptions = {}) {
        this.id = options.id;
        this.placeholder = options.placeholder;
    }

    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);
    dispose(): void {
        this.toDispose.dispose();
    }

    abstract getElements(): MaybePromise<IterableIterator<TreeElement>>;
}
export interface TreeSourceOptions {
    id?: string
    placeholder?: string
}
