import {ContainerModule, injectable } from "inversify";
import {FileSystem} from "../common";
import {FileSystemClient} from "../common/messaging/filesystem-client";
import {listen} from "../../messaging/browser/connection";
import {CommandContribution} from "../../application/common/command";
import {MenuContribution, MAIN_MENU_BAR} from "../../application/common/menu";

export const fileSystemClientModule = new ContainerModule(bind => {
    const fileSystemClient = new FileSystemClient();
    listen(fileSystemClient);
    bind<FileSystem>(FileSystem).toConstantValue(fileSystemClient);

    bind<CommandContribution>(CommandContribution).to(FileCommands);

    bind<MenuContribution>(MenuContribution).toConstantValue({
        contribute(registry) {
            // Explicitly register the Edit Submenu
            registry.registerSubmenu([MAIN_MENU_BAR], "File", "File", "1_file");

            registry.registerMenuAction([MAIN_MENU_BAR, "File", "1_new"], {
                commandId: 'file:newFile'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "File", "1_new"], {
                commandId: 'file:newFolder'
            });
            registry.registerMenuAction([MAIN_MENU_BAR, "File", "2_open"], {
                commandId: 'file:open'
            });
        }
    });
});

@injectable()
class FileCommands implements CommandContribution {

    getCommands() {
            return [
                {
                    id: 'file:newFile',
                    label: 'New File',
                    execute: () => undefined
                },
                {
                    id: 'file:newFolder',
                    label: 'New Folder',
                    execute: () => undefined
                },
                {
                    id: 'file:open',
                    label: 'Open ...',
                    execute: () => undefined
                }
            ]
        }
}