import { FileSystem, FileStat } from '../common/filesystem';
import { ClipboardService, SelectionService } from '../../application/common';
import { DialogService } from '../../application/common';
import { CommandContribution, CommandHandler, CommandRegistry } from '../../application/common/command';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { promptConfirmDialog, promptNameDialog } from '../browser/filesystem-dialogs';
import { UriSelection } from '../common/filesystem-selection';
import { inject, injectable } from 'inversify';
import { CommonCommands } from "../../application/common/commands-common";
import URI from "../../application/common/uri";



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
        @inject(DialogService) protected readonly dialogService: DialogService,
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
                dialogService: this.dialogService
            }, (uri) => {
                promptNameDialog('renamefile', uri.toString(), this.dialogService, this.fileSystem)
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_COPY,
            new FileSystemCommandHandler({
                id: Commands.FILE_COPY,
                actionId: 'copyfile',
                selectionService: this.selectionService
            }, (uri) => {
                this.clipboardService.setData({
                    text: uri.toString()
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
            }, uri => {
                let copyPath: URI
                return getDirectory(uri, this.fileSystem)
                .then(stat => {
                    let data: string = this.clipboardService.getData('text')
                    copyPath = new URI(data)
                    let targetUri = uri.append(copyPath.lastSegment())
                    return this.fileSystem.copy(copyPath.toString(), targetUri.toString())
                })
            })
        );

        registry.registerHandler(
            Commands.NEW_FILE,
            new FileSystemCommandHandler({
                id: Commands.NEW_FILE,
                actionId: 'newfile',
                selectionService: this.selectionService
            }, uri => {
                return getDirectory(uri, this.fileSystem)
                    .then( stat => {
                        let freeUri = getFreeChild('Untitled', '.txt', stat)
                        promptNameDialog('newfile', freeUri.toString(), this.dialogService, this.fileSystem)
                    })
            })
        );

        registry.registerHandler(
            Commands.NEW_FOLDER,
            new FileSystemCommandHandler({
                id: Commands.NEW_FOLDER,
                actionId: 'newfolder',
                selectionService: this.selectionService
            }, uri => {
                return getDirectory(uri, this.fileSystem)
                    .then( stat => {
                        let freeUri = getFreeChild('Untitled', '', stat)
                        promptNameDialog('newfolder', freeUri.toString() , this.dialogService, this.fileSystem)
                    })
            })
        )

        registry.registerHandler(
            Commands.FILE_DELETE,
            new FileSystemCommandHandler({
                id: Commands.FILE_DELETE,
                actionId: 'delete',
                selectionService: this.selectionService
            }, uri => {
                promptConfirmDialog(
                    'delete',
                    () => {
                        return this.fileSystem.delete(uri.toString())
                    },
                    this.dialogService,
                    this.fileSystem
                )
                return Promise.resolve()
            })
        )
    }
}

function getDirectory(candidate: URI, fileSystem: FileSystem): Promise<FileStat> {
    return fileSystem.getFileStat(candidate.toString())
        .then( stat => {
            if (!stat || !stat.isDirectory) {
                // not folder? get parent
                return fileSystem.getFileStat(new URI(stat.uri).parent().toString())
            } else {
                return Promise.resolve(stat)
            }
        })
}

function getFreeChild(prefix: string, suffix: string, fileStat: FileStat): URI {
    let infixes = ['', ' 1', ' 2', ' 3', ' 4', ' 5']
    let parentUri = new URI(fileStat.uri)
    for (let infix of infixes) {
        let candidate = prefix + infix + suffix
        let children: FileStat[] = fileStat.children!
        if (!children.some( stat => new URI(stat.uri).lastSegment() === candidate)) {
            return parentUri.append(candidate)
        }
    }
    return parentUri.append(prefix + suffix)
}

export class FileSystemCommandHandler implements CommandHandler {
    constructor(
        protected readonly options: FileSystemCommandHandler.Options,
        protected readonly doExecute: (uri: URI) => Promise<any>) {
    }

    execute(arg?: any): Promise<any> {
        const selection = this.options.selectionService.selection;
        if (UriSelection.is(selection)) {
            return this.doExecute(new URI(selection.uri))
        }
        return Promise.resolve()
    }

    isVisible(arg?: any): boolean {
        if (UriSelection.is(this.options.selectionService.selection)) {
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
        dialogService?: DialogService
    }
}