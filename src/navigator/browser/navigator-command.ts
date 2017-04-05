import { injectable, inject } from "inversify";

import { CommandHandler, CommandContribution, CommandRegistry } from '../../application/common/command';
import { CONTEXT_MENU_PATH } from "./navigator-widget";
import { Commands } from '../../filesystem/common/file-system-commands';
import { MenuContribution, MenuModelRegistry } from "../../application/common/menu";
import { FileSystem, Path } from "../../filesystem/common";
import { FileNavigatorModel } from "./navigator-model";

@injectable()
export class NavigatorCommandHandlers implements CommandContribution {
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileNavigatorModel) protected readonly model: FileNavigatorModel) {}
    contribute(registry: CommandRegistry): void {
        registry.registerHandler(
            Commands.FILE_DELETE,
            new NavigatorCommandHandler({
                id: Commands.FILE_DELETE,
                actionId: 'delete',
                fileSystem: this.fileSystem,
                model: this.model
            }, (path: Path) => {
                this.fileSystem.rm(path)
            })
        );
    }
}

@injectable()
export class NavigatorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_CUT
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_COPY
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
            commandId: Commands.FILE_PASTE
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "2_move"], {
            commandId: Commands.FILE_RENAME
        });
        registry.registerMenuAction([CONTEXT_MENU_PATH, "2_move"], {
            commandId: Commands.FILE_DELETE
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
    constructor(
        protected readonly options: NavigatorCommandHandler.Options,
        protected readonly doExecute: any) {
    }

    path: Path

    execute(arg?: any): Promise<any> {
        const node = this.options.model.selectedPathNode;
        if (node) {
            return this.doExecute(node.path)
        }
        return Promise.resolve()
    }

    isVisible(arg?: any): boolean {
        if (this.options.model.selectedNode) {
            return true;
        }
        return false;
    }

    isEnabled(arg?: any): boolean {
        return true;
    }

}

export namespace NavigatorCommandHandler {
    export interface Options {
        id: string;
        actionId: string,
        fileSystem: FileSystem,
        model: FileNavigatorModel
    }
}
