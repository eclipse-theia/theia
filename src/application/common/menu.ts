/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { Disposable } from './disposable';
import { CommandRegistry } from './command';
import { ContributionProvider } from './contribution-provider';

export interface MenuAction {
    commandId: string
    label?: string
    icon?: string
    order?: string
}

export const MAIN_MENU_BAR = 'menubar';

export const MenuContribution = Symbol("MenuContribution");
export interface MenuContribution {
    registerMenus(menus: MenuModelRegistry): void;
}

@injectable()
export class MenuModelRegistry {
    protected readonly root = new CompositeMenuNode("");

    constructor(
        @inject(ContributionProvider) @named(MenuContribution)
        protected readonly contributions: ContributionProvider<MenuContribution>,
        @inject(CommandRegistry) protected readonly commands: CommandRegistry
    ) { }

    onStart(): void {
        for (const contrib of this.contributions.getContributions()) {
            contrib.registerMenus(this);
        }
    }

    registerMenuAction(menuPath: string[], item: MenuAction): Disposable {
        const parent = this.findGroup(menuPath);
        const actionNode = new ActionMenuNode(item, this.commands);
        return parent.addNode(actionNode);
    }

    registerSubmenu(menuPath: string[], id: string, label: string): Disposable {
        const parent = this.findGroup(menuPath);
        const groupNode = new CompositeMenuNode(id, label);
        return parent.addNode(groupNode);
    }

    protected findGroup(menuPath: string[]): CompositeMenuNode {
        let currentMenu = this.root;
        for (const segment of menuPath) {
            currentMenu = this.findSubMenu(currentMenu, segment);
        }
        return currentMenu;
    }

    protected findSubMenu(current: CompositeMenuNode, menuId: string): CompositeMenuNode {
        const sub = current.children.find(e => e.id === menuId);
        if (sub instanceof CompositeMenuNode) {
            return sub;
        }
        if (sub) {
            throw Error(`'${menuId}' is not a menu group.`)
        }
        const newSub = new CompositeMenuNode(menuId);
        current.addNode(newSub);
        return newSub;
    }

    getMenu(...menuPath: string[]): CompositeMenuNode {
        return this.findGroup(menuPath);
    }
}

export interface MenuNode {
    readonly label?: string
    /**
     * technical identifier
     */
    readonly id: string

    readonly sortString: string
}

export class CompositeMenuNode implements MenuNode {
    protected readonly _children: MenuNode[] = [];
    constructor(
        public readonly id: string,
        public readonly label?: string
    ) { }

    get children(): ReadonlyArray<MenuNode> {
        return this._children;
    }

    public addNode(node: MenuNode): Disposable {
        this._children.push(node);
        this._children.sort((m1, m2) => {
            if (m1.sortString < m2.sortString) {
                return -1
            } else if (m1.sortString > m2.sortString) {
                return 1
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
        }
    }

    get sortString() {
        return this.id;
    }

    get isSubmenu(): boolean {
        return this.label !== undefined;
    }
}

export class ActionMenuNode implements MenuNode {
    constructor(
        public readonly action: MenuAction,
        protected readonly commands: CommandRegistry
    ) { }

    get id(): string {
        return this.action.commandId;
    }

    get label(): string {
        if (this.action.label) {
            return this.action.label;
        }
        const cmd = this.commands.getCommand(this.action.commandId);
        if (!cmd) {
            throw new Error(`A command with id '${this.action.commandId}' does not exist.`)
        }
        return cmd.label || cmd.id;
    }

    get icon(): string | undefined {
        return this.action.icon;
    }

    get sortString() {
        return this.action.order || this.label;
    }
}
