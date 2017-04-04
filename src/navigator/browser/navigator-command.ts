import { injectable } from "inversify";

import { CommandHandler, CommandContribution, CommandRegistry } from '../../application/common/command';
import { CONTEXT_MENU_PATH } from "./navigator-widget";
import { MenuContribution, MenuModelRegistry } from "../../application/common/menu";

export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'navigator:newFile';
    export const NEW_FOLDER = 'navigator:newFolder';
    export const FILE_OPEN = 'navigator:open';
}

@injectable()
export class NavigatorCommandHandlers implements CommandContribution {
    constructor() {}
    contribute(registry: CommandRegistry): void {
        registry.registerCommand({
                    id: Commands.NEW_FILE,
                    label: 'New File'
                });
        registry.registerCommand({
                    id: Commands.NEW_FOLDER,
                    label: 'New Folder'
                });
        registry.registerCommand({
                    id: Commands.FILE_OPEN,
                    label: 'Open ...'
                });
    }
}

@injectable()
export class NavigatorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {

        registry.registerSubmenu([CONTEXT_MENU_PATH], Commands.FILE_MENU, "File");

        registry.registerMenuAction([CONTEXT_MENU_PATH, Commands.FILE_MENU, "1_new"], {
            commandId: Commands.NEW_FILE
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, Commands.FILE_MENU, "1_new"], {
            commandId: Commands.NEW_FOLDER
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, Commands.FILE_MENU, "2_open"], {
            commandId: Commands.FILE_OPEN
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
