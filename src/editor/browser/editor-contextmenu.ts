import { injectable } from "inversify";
import IContextMenuService = monaco.editor.IContextMenuService;
import CommandsRegistry = monaco.commands.CommandsRegistry;
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

export const EditorContextMenuService = Symbol("EditorContextMenuService");

export interface EditorContextMenuService extends IContextMenuService {

}

@injectable()
export class BrowserContextMenuService implements EditorContextMenuService {

    showContextMenu(delegate: any): void {
        const ids = Object.keys(CommandsRegistry.getCommands());
        console.log(ids.length);

        const menuItems = MenuRegistry.getMenuItems(MenuId.EditorContext);
        console.log(JSON.stringify(menuItems));
    }

}