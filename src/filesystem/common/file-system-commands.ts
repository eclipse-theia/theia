import {injectable } from "inversify";
import {CommandContribution, CommandRegistry} from "../../application/common/command";
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';


export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'file:newFile';
    export const NEW_FOLDER = 'file:newFolder';
    export const FILE_OPEN = 'file:open';
    export const FILE_CUT = 'file:fileCut';
    export const FILE_COPY = 'file:fileCopy';
    export const FILE_PASTE = 'file:filePaste';
    export const FILE_RENAME = 'file:fileRename';
    export const FILE_DELETE = 'file:fileDelete';
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
            id: Commands.FILE_DELETE,
            label: 'Delete'
        });
    }
}