import { injectable, inject } from "inversify";
import { EDITOR_CONTEXT_MENU_ID } from "../../editor/browser";
import { ContextMenuRenderer, toAnchor } from "../../application/browser";
import IContextMenuService = monaco.editor.IContextMenuService;
import IContextMenuDelegate = monaco.editor.IContextMenuDelegate;

@injectable()
export class MonacoContextMenuService implements IContextMenuService {

    constructor( @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer) {
    }

    showContextMenu(delegate: IContextMenuDelegate): void {
        this.contextMenuRenderer.render(EDITOR_CONTEXT_MENU_ID, toAnchor(delegate.getAnchor()));
    }

}