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
import { Emitter, Event } from '../../common/event';
import { MaybePromise } from '../../common/types';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { TreeWidget } from '../tree';

export interface TreeElement {
    /** @default parent id + position among siblings */
    readonly id?: number | string | undefined
    /** @default true */
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
        return !!element && typeof element === 'object' && 'getElements' in element;
    }
    export function hasElements(element: unknown): element is CompositeTreeElement {
        return is(element) && element.hasElements !== false;
    }
}

/**
 * ## `abstract class TreeSource`
 *
 * A {@link TreeSource} is used to get {@link TreeElement}s for building trees.
 *
 * You may be notified when the set of {@link TreeElements} is updated via {@link onDidChange}.
 */
@injectable()
export abstract class TreeSource implements Disposable {

    abstract getElements(): MaybePromise<IterableIterator<TreeElement>>;

    /**
     * Optional identifier for this {@link TreeSource}.
     */
    readonly id?: string;
    /**
     * Optional text to display when this {@link TreeSource} is empty.
     */
    readonly placeholder?: string;

    protected readonly onDidChangeEmitter = new Emitter<this>();
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    constructor(@unmanaged() options?: TreeSourceOptions) {
        this.id = options?.id;
        this.placeholder = options?.placeholder;
    }

    get onDidChange(): Event<this> {
        return this.onDidChangeEmitter.event;
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(this);
    }
}

export interface TreeSourceOptions {
    /**
     * Optional identifier for the {@link TreeSource}.
     */
    id?: string
    /**
     * Optional text to display when the {@link TreeSource} is empty.
     */
    placeholder?: string
}
