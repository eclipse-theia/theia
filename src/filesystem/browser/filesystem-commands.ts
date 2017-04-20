import { ClipboardService, SelectionService } from '../../application/common';
import { PopupService } from '../../application/common';
import { CommandContribution, CommandHandler, CommandRegistry } from '../../application/common/command';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { promptConfirmPopup, promptNamePopup } from '../browser/filesystem-popup-handlers';
import { FileSystem } from '../common/filesystem';
import { PathSelection } from '../common/filesystem-selection';
import { Path } from '../common/path';
import { inject, injectable } from 'inversify';
import { CommonCommands } from "../../application/common/commands-common";



export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'file:newFile';
    export const NEW_FOLDER = 'file:newFolder';
    export const FILE_OPEN = 'file:open';
    export const FILE_CUT = CommonCommands.EDIT_CUT
    export const FILE_COPY = CommonCommands.EDIT_COPY
    export const FILE_PASTE = CommonCommands.EDIT_PASTE
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
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(ClipboardService) protected readonly clipboardService: ClipboardService,
        @inject(PopupService) protected readonly popupService: PopupService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        ) {}

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
            id: Commands.FILE_RENAME,
            label: 'Rename'
        });
        registry.registerCommand({
            id: Commands.FILE_DELETE,
            label: 'Delete'
        });

        registry.registerHandler(
            Commands.FILE_RENAME,
            new FileSystemCommandHandler({
                id: Commands.FILE_RENAME,
                actionId: 'renamefile',
                selectionService: this.selectionService,
                popupService: this.popupService
            }, (path: Path) => {
                promptNamePopup('renamefile', path, this.popupService, this.fileSystem)
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_COPY,
            new FileSystemCommandHandler({
                id: Commands.FILE_COPY,
                actionId: 'copyfile',
                selectionService: this.selectionService
            }, (path: Path) => {
                this.clipboardService.setData({
                    text: path.toString()
                })
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_PASTE,
            new FileSystemCommandHandler({
                id: Commands.FILE_PASTE,
                actionId: 'pastefile',
                selectionService: this.selectionService,
                clipboardService: this.clipboardService
            }, (pastePath: Path) => {
                let copyPath: Path
                return this.fileSystem.dirExists(pastePath)
                .then((targetFolderExists: boolean) => {
                    if (!targetFolderExists) {
                        // 'paste path is not folder'
                        pastePath = pastePath.parent
                    }
                    return this.fileSystem.dirExists(pastePath)
                })
                .then((targetFolderExists: boolean) => {
                    if (!targetFolderExists) {
                        return Promise.reject("paste path dont exist")
                    }
                    let data: string = this.clipboardService.getData('text')
                    copyPath = Path.fromString(data)
                    if (copyPath.simpleName) {
                        pastePath = pastePath.append(copyPath.simpleName)
                    }
                    return this.fileSystem.cp(copyPath, pastePath).then((newPath) => {
                        if (newPath !== pastePath.toString()) {
                            // need to rename to something new
                            promptNamePopup('pastefile', Path.fromString(newPath), this.popupService, this.fileSystem)
                        }
                    })
                })
            })
        );

        registry.registerHandler(
            Commands.NEW_FILE,
            new FileSystemCommandHandler({
                id: Commands.NEW_FILE,
                actionId: 'newfile',
                selectionService: this.selectionService
            }, (path: Path) => {
                let newPath: Path
                return this.fileSystem.createName(path)
                .then((newPathData: string) => {
                    newPath = Path.fromString(newPathData)
                    return this.fileSystem.writeFile(newPath, "")
                })
                .then(() => {
                    promptNamePopup('newfile', newPath, this.popupService, this.fileSystem)
                })
            })
        );

        registry.registerHandler(
            Commands.NEW_FOLDER,
            new FileSystemCommandHandler({
                id: Commands.NEW_FOLDER,
                actionId: 'newfolder',
                selectionService: this.selectionService
            }, (path: Path) => {
                let newPath: Path
                return this.fileSystem.createName(path)
                .then((newPathData: string) => {
                    newPath = Path.fromString(newPathData)
                    return this.fileSystem.mkdir(newPath)
                })
                .then(() => {
                    promptNamePopup('newfolder', newPath, this.popupService, this.fileSystem)
                })
            })
        );

        registry.registerHandler(
            Commands.FILE_DELETE,
            new FileSystemCommandHandler({
                id: Commands.FILE_DELETE,
                actionId: 'delete',
                selectionService: this.selectionService
            }, (path: Path) => {
                return this.fileSystem.dirExists(path)
                .then((isDir) => {
                    promptConfirmPopup(
                        'delete',
                        () => {
                            if (isDir) {
                                return this.fileSystem.rmdir(path)
                            }
                            return this.fileSystem.rm(path)
                        },
                        this.popupService,
                        this.fileSystem
                    )
                })
            })
        );
    }
}

export class FileSystemCommandHandler implements CommandHandler {
    constructor(
        protected readonly options: FileSystemCommandHandler.Options,
        protected readonly doExecute: (path: Path) => Promise<any>) {
    }

    execute(arg?: any): Promise<any> {
        const selection = this.options.selectionService.selection;
        if (PathSelection.is(selection)) {
            return this.doExecute(selection.path)
        }
        return Promise.resolve()
    }

    isVisible(arg?: any): boolean {
        if (PathSelection.is(this.options.selectionService.selection)) {
            return true;
        }
        return false;
    }

    isEnabled(arg?: any): boolean {
        if (this.options.actionId === 'pastefile') {
            if (!this.options.clipboardService) {
                return false
            }
            if (this.options.clipboardService.isEmpty) {
                return false
            }
            let data: any = this.options.clipboardService.getData("text")
            if (!data) {
                return false
            }
        }
        return true;
    }

}

export namespace FileSystemCommandHandler {
    export interface Options {
        id: string;
        actionId: string,
        selectionService: SelectionService,
        clipboardService?: ClipboardService
        popupService?: PopupService
    }
}