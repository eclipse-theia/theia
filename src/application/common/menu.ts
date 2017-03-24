
import { multiInject, injectable } from "inversify";

export const MenuBarContribution = Symbol("MenuBarContribution");
export interface MenuBarContribution {
    contribute(menuBar: MenuBar): MenuBar;
}

@injectable()
export class MenuBarModelProvider {
    public menuBar: MenuBar = {
        menus: []
    };

    constructor(@multiInject(MenuBarContribution) contribs: MenuBarContribution[]) {
        for (let contrib of contribs) {
            this.menuBar = contrib.contribute(this.menuBar);
        }
    }
}

export interface MenuBar {
    menus: Menu[];
}

export interface Menu extends MenuItem {
    label: string
    items: MenuItem[];
}

export function isMenu(item: any): item is Menu {
    return (item.label && item.items);
}

export interface MenuItem {
    command?: string;
    separator?: boolean;
}
