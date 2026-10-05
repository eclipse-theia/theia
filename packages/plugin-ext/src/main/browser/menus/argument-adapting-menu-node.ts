// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { AcceleratorSource, CommandMenu, CompoundMenuNode, ContextExpressionMatcher, Event, MenuNode } from '@theia/core';
import { ArgumentAdapter } from './plugin-menu-command-adapter';

/**
 * Presents a command menu node whose actions receive the arguments converted by an {@link ArgumentAdapter}.
 */
export class ArgumentAdaptingCommandMenu implements CommandMenu, AcceleratorSource {

    constructor(protected readonly delegate: CommandMenu, protected readonly adapter: ArgumentAdapter) { }

    get id(): string { return this.delegate.id; }
    get when(): string | undefined { return this.delegate.when; }
    get sortString(): string { return this.delegate.sortString; }
    get label(): string { return this.delegate.label; }
    get icon(): string | undefined { return this.delegate.icon; }
    get onDidChange(): Event<void> | undefined { return this.delegate.onDidChange; }

    isVisible<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.delegate.isVisible(contextMatcher, context, ...this.adapter(...args));
    }

    isEnabled(...args: unknown[]): boolean {
        return this.delegate.isEnabled(...this.adapter(...args));
    }

    isToggled(...args: unknown[]): boolean {
        return this.delegate.isToggled(...this.adapter(...args));
    }

    run(...args: unknown[]): Promise<void> {
        return this.delegate.run(...this.adapter(...args));
    }

    getAccelerator(context: HTMLElement | undefined): string[] {
        return AcceleratorSource.is(this.delegate) ? this.delegate.getAccelerator(context) : [];
    }
}

/**
 * Presents a compound menu node whose descendant actions receive the arguments converted by an {@link ArgumentAdapter}.
 *
 * VS Code determines the arguments of a menu item by the contribution point through which it is reached,
 * so when an adapting node is nested in another one, the outer adapter replaces the inner one.
 */
export class ArgumentAdaptingCompoundMenuNode implements CompoundMenuNode {

    protected readonly adaptedChildren = new WeakMap<MenuNode, MenuNode>();

    constructor(protected readonly delegate: CompoundMenuNode, protected readonly adapter: ArgumentAdapter) { }

    get id(): string { return this.delegate.id; }
    get when(): string | undefined { return this.delegate.when; }
    get sortString(): string { return this.delegate.sortString; }
    get onDidChange(): Event<void> | undefined { return this.delegate.onDidChange; }
    get contextKeyOverlays(): Record<string, string> | undefined { return this.delegate.contextKeyOverlays; }
    // Forwarded so that a submenu stays a submenu and a group stays a group, see `RenderedMenuNode.is`.
    get label(): string | undefined { return (this.delegate as Partial<CommandMenu>).label; }
    get icon(): string | undefined { return (this.delegate as Partial<CommandMenu>).icon; }

    get children(): MenuNode[] {
        return this.delegate.children.map(child => this.adapt(child));
    }

    isVisible<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        return this.delegate.isVisible(contextMatcher, context, ...this.adapter(...args));
    }

    isEmpty<T>(contextMatcher: ContextExpressionMatcher<T>, context: T | undefined, ...args: unknown[]): boolean {
        for (const child of this.children) {
            if (child.isVisible(contextMatcher, context, ...args)) {
                if (!CompoundMenuNode.is(child) || !child.isEmpty(contextMatcher, context, ...args)) {
                    return false;
                }
            }
        }
        return true;
    }

    protected adapt(child: MenuNode): MenuNode {
        let adapted = this.adaptedChildren.get(child);
        if (!adapted) {
            adapted = this.createAdaptedNode(child);
            this.adaptedChildren.set(child, adapted);
        }
        return adapted;
    }

    protected createAdaptedNode(child: MenuNode): MenuNode {
        if (child instanceof ArgumentAdaptingCompoundMenuNode) {
            return new ArgumentAdaptingCompoundMenuNode(child.delegate, this.adapter);
        }
        if (CommandMenu.is(child)) {
            return new ArgumentAdaptingCommandMenu(child, this.adapter);
        }
        if (CompoundMenuNode.is(child)) {
            return new ArgumentAdaptingCompoundMenuNode(child, this.adapter);
        }
        return child;
    }
}
