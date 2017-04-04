import { injectable } from "inversify";
import IContextMenuService = monaco.editor.IContextMenuService;
import CommandsRegistry = monaco.editor.CommandsRegistry;

export const EditorContextMenuService = Symbol("EditorContextMenuService");

export interface EditorContextMenuService extends IContextMenuService {

}

@injectable()
export class BrowserContextMenuService implements EditorContextMenuService {

    showContextMenu(delegate: any): void {
        console.log(JSON.stringify(CommandsRegistry.getCommands()));
        console.log(JSON.stringify(monaco.editor.CommandsRegistry.getCommands()));
    }

}