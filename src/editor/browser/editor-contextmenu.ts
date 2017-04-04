import { injectable } from "inversify";
import IContextMenuService = monaco.editor.IContextMenuService;

export const IContextMenuService = Symbol("IContextMenuService");

@injectable()
export class NoopContextMenuService implements IContextMenuService {

    showContextMenu(delegate: any): void {
        // NOOP
    }

}
