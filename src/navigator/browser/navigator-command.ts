/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { CommandHandler, CommandContribution, CommandRegistry } from '../../application/common/command';
import { CONTEXT_MENU_PATH } from "./navigator-widget";
import { Commands } from '../../filesystem/browser/filesystem-commands';
import { MenuContribution, MenuModelRegistry } from "../../application/common/menu";
import { FileSystem, FileStat } from "../../filesystem/common/filesystem";
import { FileNavigatorModel } from "./navigator-model";

@injectable()
export class NavigatorCommandHandlers implements CommandContribution {
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileNavigatorModel) protected readonly model: FileNavigatorModel) { }
    contribute(registry: CommandRegistry): void {
        // registry.registerHandler(
        //     Commands.FILE_DELETE,
        //     new NavigatorCommandHandler({
        //         id: Commands.FILE_DELETE,
        //         actionId: 'delete',
        //         fileSystem: this.fileSystem,
        //         model: this.model
        //     }, (path: Path) => {
        //         this.fileSystem.rm(path)
        //     })
        // );
    }
}

@injectable()
export class NavigatorMenuContribution implements MenuContribution {
    contribute(registry: MenuModelRegistry) {
        // registry.registerMenuAction([CONTEXT_MENU_PATH, "1_cut/copy/paste"], {
        //     commandId: Commands.FILE_CUT
        // });
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
        protected readonly doExecute: (fileStat: FileStat) => Promise<any>) {
    }

    execute(arg?: any): Promise<any> {
        const node = this.options.model.selectedFileStatNode;
        if (node) {
            return this.doExecute(node.fileStat)
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
