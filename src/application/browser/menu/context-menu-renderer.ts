import { inject, injectable } from "inversify";
import { MainMenuFactory } from "./menu-plugin";

export const ContextMenuRenderer = Symbol("ContextMenuRenderer");

export interface ContextMenuRenderer {
    render(path: string, event: MouseEvent): void;
}

@injectable()
export class BrowserContextMenuRenderer implements ContextMenuRenderer {

    constructor(
        @inject(MainMenuFactory) private menuFactory: MainMenuFactory) {}

    render(path: string, event: MouseEvent): void {
        const contextMenu = this.menuFactory.createContextMenu(path);

        contextMenu.open(event.clientX, event.clientY);
    }
}