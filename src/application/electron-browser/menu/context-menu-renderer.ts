import { inject, injectable } from "inversify";
import { MainMenuFactory } from "./menu-plugin";
import { Anchor, ContextMenuRenderer } from "../../browser/menu/context-menu-renderer";

@injectable()
export class ElectronContextMenuRenderer implements ContextMenuRenderer {

    constructor( @inject(MainMenuFactory) private menuFactory: MainMenuFactory) {
    }

    render(path: string, anchor: Anchor): void {
        const menu = this.menuFactory.createContextMenu(path);
        menu.popup();
    }

}