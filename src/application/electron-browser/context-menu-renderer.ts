import { inject, injectable } from "inversify";
import { ContextMenuRenderer } from "../../application/browser/context-menu-renderer";
import { MainMenuFactory } from "./menu/menu-plugin";

@injectable()
export class ContextMenuService implements ContextMenuRenderer {

    constructor(
        @inject(MainMenuFactory) private menuFactory: MainMenuFactory) {}

    render(path: string, event: MouseEvent): void {
        const menu = this.menuFactory.createContextMenu(path);

        menu.popup();
    }
}