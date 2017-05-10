/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { FileSystem, FileStat } from '../common/filesystem';
import { ClipboardService, SelectionService } from '../../application/common';
import { CommandContribution, CommandHandler, CommandRegistry } from '../../application/common/command';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { UriSelection } from '../common/filesystem-selection';
import { inject, injectable } from 'inversify';
import { CommonCommands } from "../../application/common/commands-common";
import URI from "../../application/common/uri";
import { SingleTextInputDialog, ConfirmDialog } from "../../application/browser/dialogs";



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
                selectionService: this.selectionService
            }, (uri) => {
                return this.fileSystem.getFileStat(uri.toString())
                    .then( stat => {
                        let dialog = new SingleTextInputDialog('Rename File', {
                            initialValue: uri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then( name =>
                            this.fileSystem.move(uri.toString(), uri.parent.appendPath(name).toString()))
                    })
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
                    let targetUri = uri.appendPath(copyPath.lastSegment)
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
                        let dialog = new SingleTextInputDialog(`New File Below '${freeUri.parent.lastSegment}'`, {
                            initialValue: freeUri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then( name =>
                            this.fileSystem.createFile(new URI(stat.uri).appendPath(name).toString()))
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
                        let dialog = new SingleTextInputDialog(`New Folder Below '${freeUri.parent.lastSegment}'`, {
                            initialValue: freeUri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then( name =>
                            this.fileSystem.createFolder(new URI(stat.uri).appendPath(name).toString()))
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
                let dialog = new ConfirmDialog('Delete File', `Do you really want to delete '${uri.lastSegment}'?`)
                return dialog.acceptancePromise.then(() => {
                    return this.fileSystem.delete(uri.toString())
                })
            })
        )
    }
}

/**
 * returns an error message or an empty string if the file name is valid
 * @param name the simple file name to validate
 * @param parent the parent directory's file stat
 */
function validateFileName(name: string, parent: FileStat): string {
    if (!name || !name.match(/^[\w\-. ]+$/)) {
        return "Invalid name, try other"
    } else {
        if (parent.children) {
            for (let child of parent.children) {
                if (new URI(child.uri).lastSegment === name) {
                    return 'A file with this name already exists.'
                }
            }
        }
    }
    return ''
}

function getDirectory(candidate: URI, fileSystem: FileSystem): Promise<FileStat> {
    return fileSystem.getFileStat(candidate.toString())
        .then( stat => {
            if (!stat || !stat.isDirectory) {
                // not folder? get parent
                return fileSystem.getFileStat(new URI(stat.uri).parent.toString())
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
        if (!children.some( stat => new URI(stat.uri).lastSegment === candidate)) {
            return parentUri.appendPath(candidate)
        }
    }
    return parentUri.appendPath(prefix + suffix)
}

export class FileSystemCommandHandler implements CommandHandler {
    constructor(
        protected readonly options: FileSystemCommandHandler.Options,
        protected readonly doExecute: (uri: URI) => Promise<any>) {
    }

    execute(arg?: any): Promise<any> {
        const selection = this.options.selectionService.selection;
        if (UriSelection.is(selection)) {
            return this.doExecute(selection.uri)
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
    }
}