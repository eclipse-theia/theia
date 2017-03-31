import {injectable } from "inversify";
import {CommandContribution, CommandRegistry} from "../../application/common/command";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';


export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'file:newFile';
    export const NEW_FOLDER = 'file:newFolder';
    export const FILE_OPEN = 'file:open';
}

@injectable()
export class FileMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
            // Explicitly register the Edit Submenu
            registry.registerSubmenu([MAIN_MENU_BAR], Commands.FILE_MENU, "File");

            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "1_new"], {
                commandId: Commands.NEW_FILE
            });
            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "1_new"], {
                commandId: Commands.NEW_FOLDER
            });
            registry.registerMenuAction([MAIN_MENU_BAR, Commands.FILE_MENU, "2_open"], {
                commandId: Commands.FILE_OPEN
            });
        }
}

@injectable()
export class FileCommandContribution implements CommandContribution {

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