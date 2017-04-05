import { injectable } from "inversify";

import { CommandHandler, CommandContribution, CommandRegistry } from '../../application/common/command';
import { CONTEXT_MENU_PATH } from "./navigator-widget";
import { MenuContribution, MenuModelRegistry } from "../../application/common/menu";

export namespace Commands {
    export const FILE_MENU = "1_file";
    export const FILE_CUT = 'navigator:fileCut';
    export const FILE_COPY = 'navigator:fileCopy';
    export const FILE_PASTE = 'navigator:filePaste';
    export const FILE_RENAME = 'navigator:fileRename';
    export const NEW_FILE = 'navigator:newFile';
    export const NEW_FOLDER = 'navigator:newFolder';
}

@injectable()
export class NavigatorCommandHandlers implements CommandContribution {
    constructor() {}
    contribute(registry: CommandRegistry): void {
        registry.registerCommand({
            id: Commands.FILE_CUT,
            label: 'Cut'
        });
        registry.registerCommand({
            id: Commands.FILE_COPY,
            label: 'Copy'
        });
        registry.registerCommand({
            id: Commands.FILE_PASTE,
            label: 'Paste'
        });
        registry.registerCommand({
            id: Commands.FILE_RENAME,
            label: 'Rename'
        });
        registry.registerCommand({
            id: Commands.NEW_FILE,
            label: 'New File'
        });
        registry.registerCommand({
            id: Commands.NEW_FOLDER,
            label: 'New Folder'
        });
    }
}

@injectable()
export class NavigatorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {

        // registry.registerSubmenu([CONTEXT_MENU_PATH], Commands.FILE_MENU, "File");

        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_CUT
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_COPY
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_PASTE
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "2_rename"], {
            commandId: Commands.FILE_RENAME
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "3_new"], {
            commandId: Commands.NEW_FILE
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "3_new"], {
            commandId: Commands.NEW_FOLDER
        });
    }
}

export class NavigatorCommandHandler implements CommandHandler {
    constructor(protected readonly options: NavigatorCommandHandler.Options) {
    }

    get id(): string {
        return this.options.id;
    }

    execute(arg?: any): Promise<any> {

        return Promise.resolve();
    }

    isVisible(arg?: any): boolean {
        return true;
    }

    isEnabled(arg?: any): boolean {
        return true;
    }

}

export namespace NavigatorCommandHandler {
    export interface Options {
        id: string;
        actionId: string
    }
}
