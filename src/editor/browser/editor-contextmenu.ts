import { injectable } from "inversify";
import IContextMenuService = monaco.editor.IContextMenuService;
import CommandsRegistry = monaco.commands.CommandsRegistry;

export const EditorContextMenuService = Symbol("EditorContextMenuService");

export interface EditorContextMenuService extends IContextMenuService {

}

@injectable()
export class BrowserContextMenuService implements EditorContextMenuService {

    showContextMenu(delegate: any): void {
        const ids = Object.keys(CommandsRegistry.getCommands());
        console.log(ids.length);
        // for (let id of ids) {
        //     const command = CommandsRegistry.getCommand(id);
        //     console.log();
        //     console.log(id);
        //     console.log(command);
        // }
    }

}