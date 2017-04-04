export const ContextMenuRenderer = Symbol("ContextMenuRenderer");
import { inject, injectable } from "inversify";
import { MainMenuFactory } from "./menu/menu-plugin";

export interface ContextMenuRenderer {
    render(path: string, event: MouseEvent): void;
}

@injectable()
export class ContextMenuService implements ContextMenuRenderer {

    constructor(
        @inject(MainMenuFactory) private menuFactory: MainMenuFactory) {}

    render(path: string, event: MouseEvent): void {
        const contextMenu = this.menuFactory.createContextMenu(path);

        contextMenu.open(event);
    }
}