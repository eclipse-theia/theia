// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { Disposable } from '../disposable';
import { MenuNode, SubMenuOptions } from './menu-types';

/**
 * Node representing a (sub)menu in the menu tree structure.
 */
export class CompositeMenuNode implements MenuNode {
    protected readonly _children: MenuNode[] = [];
    public iconClass?: string;
    public order?: string;
    readonly when?: string;

    constructor(
        public readonly id: string,
        public label?: string,
        options?: SubMenuOptions
    ) {
        if (options) {
            this.iconClass = options.iconClass;
            this.order = options.order;
            this.when = options.when;
        }
    }

    get icon(): string | undefined {
        return this.iconClass;
    }

    get children(): ReadonlyArray<MenuNode> {
        return this._children;
    }

    /**
     * Inserts the given node at the position indicated by `sortString`.
     *
     * @returns a disposable which, when called, will remove the given node again.
     */
    public addNode(node: MenuNode): Disposable {
        this._children.push(node);
        this._children.sort((m1, m2) => {
            // The navigation group is special as it will always be sorted to the top/beginning of a menu.
            if (CompositeMenuNode.isNavigationGroup(m1)) {
                return -1;
            }
            if (CompositeMenuNode.isNavigationGroup(m2)) {
                return 1;
            }
            if (m1.sortString < m2.sortString) {
                return -1;
            } else if (m1.sortString > m2.sortString) {
                return 1;
            } else {
                return 0;
            }
        });
        return {
            dispose: () => {
                const idx = this._children.indexOf(node);
                if (idx >= 0) {
                    this._children.splice(idx, 1);
                }
            }
        };
    }

    /**
     * Removes the first node with the given id.
     *
     * @param id node id.
     */
    public removeNode(id: string): void {
        const node = this._children.find(n => n.id === id);
        if (node) {
            const idx = this._children.indexOf(node);
            if (idx >= 0) {
                this._children.splice(idx, 1);
            }
        }
    }

    get sortString(): string {
        return this.order || this.id;
    }

    get isSubmenu(): boolean {
        return Boolean(this.label);
    }

    /**
     * Indicates whether the given node is the special `navigation` menu.
     *
     * @param node the menu node to check.
     * @returns `true` when the given node is a {@link CompositeMenuNode} with id `navigation`,
     * `false` otherwise.
     */
    static isNavigationGroup(node: MenuNode): node is CompositeMenuNode {
        return node instanceof CompositeMenuNode && node.id === 'navigation';
    }
}

export class CompositeMenuNodeWrapper implements MenuNode {
    constructor(protected readonly wrapped: Readonly<CompositeMenuNode>, protected readonly options?: SubMenuOptions) { }

    get id(): string { return this.wrapped.id; }

    get label(): string | undefined { return this.wrapped.label; }

    get sortString(): string { return this.order || this.id; }

    get isSubmenu(): boolean { return Boolean(this.label); }

    get icon(): string | undefined { return this.iconClass; }

    get iconClass(): string | undefined { return this.options?.iconClass ?? this.wrapped.iconClass; }

    get order(): string | undefined { return this.options?.order ?? this.wrapped.order; }

    get when(): string | undefined { return this.options?.when ?? this.wrapped.when; }

    get children(): ReadonlyArray<MenuNode> { return this.wrapped.children; }
}
