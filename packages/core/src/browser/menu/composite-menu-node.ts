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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CommandMenu, CompoundMenuNode, ContextExpressionMatcher, Group, MenuNode, MenuPath, MutableCompoundMenuNode, RenderedMenuNode, Submenu } from '../../common/menu/menu-types';
// import { Event } from '../../common';

export class SubMenuLink implements CompoundMenuNode {
    constructor(private readonly delegate: CompoundMenuNode & Partial<RenderedMenuNode>, private readonly _sortString?: string, private readonly _when?: string,
        private readonly argumentAdapter?: (...args: unknown[]) => unknown[]) { }

    get id(): string { return this.delegate.id; };
    get transparent(): boolean | undefined { return this.delegate.transparent; }
    get children(): MenuNode[] {
        const { argumentAdapter } = this;
        if (!argumentAdapter) { return this.delegate.children; }
        return this.delegate.children.map(child =>
            CommandMenu.is(child) ? new DelegatingAction(child, argumentAdapter) : CompoundMenuNode.is(child) ? new SubMenuLink(child, child.sortString, undefined, argumentAdapter) : child
        );
    }
    get contextKeyOverlays(): Record<string, string> | undefined { return this.delegate.contextKeyOverlays; }
    get label(): string | undefined { return this.delegate.label; };
    get icon(): string | undefined { return this.delegate.icon; };

    get sortString(): string { return this._sortString || this.delegate.sortString; };
    isVisible<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.delegate.isVisible(contextMatcher, context) && this._when ? contextMatcher.match(this._when, context) : true;
    }

    isEmpty<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.delegate.isEmpty(contextMatcher, context, args);
    }
}

export class DelegatingAction implements CommandMenu {
    constructor(private readonly delegate: CommandMenu, private readonly adapter: (...args: unknown[]) => unknown[]) { }

    get id(): string { return this.delegate.id; };
    get sortString(): string { return this.delegate.sortString; };
    get label(): string { return this.delegate.label; };
    get icon(): string | undefined { return this.delegate.icon; }

    isVisible<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        const adaptedArgs = this.adapter(...args);
        return this.delegate.isVisible(contextMatcher, context, ...adaptedArgs);
    }

    isEnabled<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        const adaptedArgs = this.adapter(...args);
        return this.delegate.isEnabled(contextMatcher, context, ...adaptedArgs);
    }

    isToggled<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        const adaptedArgs = this.adapter(...args);
        return this.delegate.isToggled(contextMatcher, context, ...adaptedArgs);
    }

    run(...args: unknown[]): Promise<void> {
        const adaptedArgs = this.adapter(...args);
        return this.delegate.run(...adaptedArgs);
    }
}

/**
 * Node representing a (sub)menu in the menu tree structure.
 */
export abstract class AbstractCompoundMenuImpl implements MutableCompoundMenuNode, CompoundMenuNode {
    readonly children: MenuNode[] = [];

    protected constructor(
        readonly id: string,
        protected readonly orderString?: string,
        protected readonly when?: string
    ) {
    }

    getOrCreate(menuPath: MenuPath, pathIndex: number, endIndex: number): MutableCompoundMenuNode & CompoundMenuNode {
        if (pathIndex === endIndex) {
            return this;
        }
        let child = this.getNode(menuPath[pathIndex]);
        if (!child) {
            child = new GroupImpl(menuPath[pathIndex]);
            this.addNode(child);
        }
        if (child instanceof AbstractCompoundMenuImpl) {
            return child.getOrCreate(menuPath, pathIndex + 1, endIndex);
        } else {
            throw new Error(`An item exists, but it's not a parent: ${menuPath} at ${pathIndex}`);
        }
    }

    /**
     * Menu nodes are sorted in ascending order based on their `sortString`.
     */
    isVisible<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return (!this.when || contextMatcher.match(this.when, context));
    }

    isEmpty<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        for (const child of this.children) {
            if (child.isVisible(contextMatcher, context, args)) {
                if (!CompoundMenuNode.is(child) || !child.isEmpty(contextMatcher, context, args)) {
                    return false;
                }
            }
        }
        return true;
    }

    addNode(...node: MenuNode[]): void {
        this.children.push(...node);
        this.children.sort(CompoundMenuNode.sortChildren);
    }

    getNode(id: string): MenuNode | undefined {
        return this.children.find(node => node.id === id);
    }

    removeById(id: string): void {
        const idx = this.children.findIndex(node => node.id === id);
        if (idx >= 0) {
            this.children.splice(idx, 1);
        }
    }

    removeNode(node: MenuNode): void {
        const idx = this.children.indexOf(node);
        if (idx >= 0) {
            this.children.splice(idx, 1);
        }
    }

    get sortString(): string {
        return this.orderString || this.id;
    }
}

export class GroupImpl extends AbstractCompoundMenuImpl implements Group {
    constructor(
        id: string,
        orderString?: string,
        when?: string
    ) {
        super(id, orderString, when);
    }
}

export class SubmenuImpl extends AbstractCompoundMenuImpl implements Submenu {

    constructor(
        id: string,
        readonly label: string,
        readonly contextKeyOverlays: Record<string, string> | undefined,
        orderString?: string,
        readonly icon?: string,
        when?: string,
        readonly transparent?: boolean,
    ) {
        super(id, orderString, when);
    }
}
