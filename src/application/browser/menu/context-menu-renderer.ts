import { inject, injectable } from "inversify";
import { MainMenuFactory } from "./menu-plugin";

export type Anchor = MouseEvent | { x: number, y: number };

export const ContextMenuRenderer = Symbol("ContextMenuRenderer");

export interface ContextMenuRenderer {
    render(path: string, anchor: Anchor): void;
}

@injectable()
export class BrowserContextMenuRenderer implements ContextMenuRenderer {

    constructor(
        @inject(MainMenuFactory) private menuFactory: MainMenuFactory) { }

    render(path: string, anchor: Anchor): void {
        const contextMenu = this.menuFactory.createContextMenu(path);
        const {x, y} = this.getAnchor(anchor);
        contextMenu.open(x, y);
    }

    private getAnchor(event: MouseEvent | { x: number, y: number }): { x: number, y: number } {
        if (event instanceof MouseEvent) {
            return { x: event.clientX, y: event.clientY };
        }
        return event;
    }

}