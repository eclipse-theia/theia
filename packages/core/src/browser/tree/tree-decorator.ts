/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable } from 'inversify';
import { Tree, TreeNode } from './tree';
import { Event, Emitter, Disposable, DisposableCollection, MaybePromise } from '../../common';
import { WidgetDecoration } from '../widget-decoration';

/**
 * Tree decorator that can change the look and the style of the tree items within a widget.
 */
export interface TreeDecorator {

    /**
     * The unique identifier of the decorator. Ought to be unique in the application.
     */
    readonly id: string;

    /**
     * Fired when this decorator has calculated all the decoration data for the tree nodes. Keys are the unique identifier of the tree nodes.
     */
    readonly onDidChangeDecorations: Event<(tree: Tree) => Map<string, TreeDecoration.Data>>;

    /**
     * Returns with the current decoration data for the tree argument.
     *
     * @param tree the tree to decorate.
     */
    decorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data>>;

}

/**
 * Decorator service which emits events from all known tree decorators.
 * Keys are the unique tree node IDs and the values
 * are the decoration data collected from all the decorators known by this service.
 */
export const TreeDecoratorService = Symbol('TreeDecoratorService');
export interface TreeDecoratorService extends Disposable {

    /**
     * Fired when any of the available tree decorators has changes.
     */
    readonly onDidChangeDecorations: Event<void>;

    /**
     * Returns with the decorators for the tree based on the actual state of this decorator service.
     */
    getDecorations(tree: Tree): MaybePromise<Map<string, TreeDecoration.Data[]>>;

    /**
     * Transforms the decorators argument into an object, so that it can be safely serialized into JSON.
     */
    deflateDecorators(decorations: Map<string, TreeDecoration.Data[]>): object;

    /**
     * Counterpart of the [deflateDecorators](#deflateDecorators) method. Restores the argument into a Map
     * of tree node IDs and the corresponding decorations data array.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inflateDecorators(state: any): Map<string, TreeDecoration.Data[]>;

}

/**
 * The default tree decorator service. Does nothing at all. One has to rebind to a concrete implementation
 * if decorators have to be supported in the tree widget.
 */
@injectable()
export class NoopTreeDecoratorService implements TreeDecoratorService {

    protected readonly emitter = new Emitter<void>();
    readonly onDidChangeDecorations = this.emitter.event;

    dispose(): void {
        this.emitter.dispose();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getDecorations(): Map<any, any> {
        return new Map();
    }

    deflateDecorators(): object {
        return {};
    }

    inflateDecorators(): Map<string, TreeDecoration.Data[]> {
        return new Map();
    }

}

/**
 * Abstract decorator service implementation which emits events from all known tree decorators and caches the current state.
 */
@injectable()
export abstract class AbstractTreeDecoratorService implements TreeDecoratorService {

    protected readonly onDidChangeDecorationsEmitter = new Emitter<void>();
    readonly onDidChangeDecorations = this.onDidChangeDecorationsEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly decorators: ReadonlyArray<TreeDecorator>) {
        this.toDispose.push(this.onDidChangeDecorationsEmitter);
        this.toDispose.pushAll(this.decorators.map(decorator =>
            decorator.onDidChangeDecorations(data =>
                this.onDidChangeDecorationsEmitter.fire(undefined)
            ))
        );
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async getDecorations(tree: Tree): Promise<Map<string, TreeDecoration.Data[]>> {
        const changes = new Map();
        for (const decorator of this.decorators) {
            for (const [id, data] of (await decorator.decorations(tree)).entries()) {
                if (changes.has(id)) {
                    changes.get(id)!.push(data);
                } else {
                    changes.set(id, [data]);
                }
            }
        }
        return changes;
    }

    deflateDecorators(decorations: Map<string, TreeDecoration.Data[]>): object {
        // eslint-disable-next-line no-null/no-null
        const state = Object.create(null);
        for (const [id, data] of decorations) {
            state[id] = data;
        }
        return state;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inflateDecorators(state: any): Map<string, TreeDecoration.Data[]> {
        const decorators = new Map<string, TreeDecoration.Data[]>();
        for (const id of Object.keys(state)) {
            decorators.set(id, state[id]);
        }
        return decorators;
    }

}

/**
 * @deprecated import from `@theia/core/lib/browser/widget-decoration` instead.
 */
export import TreeDecoration = WidgetDecoration;

export interface DecoratedTreeNode extends TreeNode {
    /**
     * The additional tree decoration data attached to the tree node itself.
     */
    readonly decorationData: TreeDecoration.Data;
}
export namespace DecoratedTreeNode {
    /**
     * Type-guard for decorated tree nodes.
     */
    export function is(node: TreeNode | undefined): node is DecoratedTreeNode {
        return !!node && 'decorationData' in node;
    }
}
