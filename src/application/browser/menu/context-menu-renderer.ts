import { inject, injectable } from "inversify";
import { MainMenuFactory } from "./menu-plugin";

export type Anchor = MouseEvent | { x: number, y: number };

export function toAnchor(anchor: HTMLElement | { x: number, y: number }): Anchor {
    return anchor instanceof HTMLElement ? {x: anchor.offsetLeft, y: anchor.offsetTop} : anchor;
}

export const ContextMenuRenderer = Symbol("ContextMenuRenderer");

export interface ContextMenuRenderer {
    render(path: string, anchor: Anchor): void;
}

@injectable()
export class BrowserContextMenuRenderer implements ContextMenuRenderer {

    constructor( @inject(MainMenuFactory) private menuFactory: MainMenuFactory) {
    }

    render(path: string, anchor: Anchor): void {
        const contextMenu = this.menuFactory.createContextMenu(path);
        const { x, y } = anchor instanceof MouseEvent ? { x: anchor.clientX, y: anchor.clientY } : anchor;
        contextMenu.open(x, y);
    }

}