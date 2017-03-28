import { CommandRegistry } from './command';
import { Disposable } from './';

import { multiInject, injectable, inject } from "inversify";

export interface MenuAction {
    commandId: string
    label?: string
    icon?: string
    order?: string
}

export const MAIN_MENU_BAR = 'menubar';

export const MenuContribution = Symbol("MenuContribution");
export interface MenuContribution {
    contribute(menuRegistry: MenuModelRegistry): void;
}

@injectable()
export class MenuModelRegistry {
    public menus: CompositeMenuNode = new CompositeMenuNode("");

    constructor(@multiInject(MenuContribution) contribs: MenuContribution[],
                @inject(CommandRegistry) private commands: CommandRegistry) {
        for (let contrib of contribs) {
            contrib.contribute(this);
        }
    }

    registerMenuAction(menuPath: string[], item: MenuAction): Disposable {
        const parent = this.findGroup(menuPath);
        const actionNode = new ActionMenuNode(item, this.commands);
        return parent.addNode(actionNode);
    }

    registerSubmenu(menuPath: string[], id: string, label: string, sortString?: string): Disposable {
        const parent = this.findGroup(menuPath);
        const groupNode = new CompositeMenuNode(id, label, sortString);
        return parent.addNode(groupNode);
    }

    private findGroup(menuPath: string[]): CompositeMenuNode {
        let currentMenu = this.menus;
        for (let segment of menuPath) {
            let sub = currentMenu.subMenus.find(e => e.id === segment);
            if (sub instanceof CompositeMenuNode) {
                currentMenu = sub;
            } else if (!sub) {
                const newSub = new CompositeMenuNode(segment);
                currentMenu.addNode(newSub);
                currentMenu = newSub;
            } else {
                throw Error(`'${segment}' is not a menu group.`)
            }
        }
        return currentMenu;
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
    public subMenus: MenuNode[] = []
    constructor(public id: string,
                public label?: string,
                private _sortString?: string) {}

    public addNode(node: MenuNode): Disposable {
        this.subMenus.push(node);
        this.subMenus.sort((m1, m2) => {
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
                const idx = this.subMenus.indexOf(node);
                if (idx >= 0) {
                    this.subMenus.splice(idx, 1);
                }
            }
        }
    }

    get sortString() {
        return this._sortString || this.id;
    }

    get isSubmenu(): boolean {
        return this.label !== undefined;
    }
}

export class ActionMenuNode implements MenuNode {
    constructor(public action: MenuAction, private commands: CommandRegistry) {}

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
        return cmd.label;
    }

    get icon(): string|undefined {
        return this.action.icon;
    }

    get sortString() {
        return this.action.order || this.label;
    }
}
