/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from "../../application/common/uri";
import { ClipboardService, SelectionService } from '../../application/common';
import { Command, CommandContribution, CommandHandler, CommandRegistry } from '../../application/common/command';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '../../application/common/menu';
import { CommonCommands } from "../../application/common/commands-common";
import { FileSystem, FileStat } from '../common/filesystem';
import { UriSelection } from '../common/filesystem-selection';
import { SingleTextInputDialog, ConfirmDialog } from "../../application/browser/dialogs";
import { OpenerService, OpenHandler, open } from "../../application/browser";

export namespace Commands {
    export const FILE_MENU = "1_file";
    export const NEW_FILE = 'file:newFile';
    export const NEW_FOLDER = 'file:newFolder';
    export const FILE_OPEN = 'file:open';
    export const FILE_OPEN_WITH = (opener: OpenHandler): Command => <Command>{
        id: `file:openWith:${opener.id}`,
        label: opener.label,
        iconClass: opener.iconClass
    };
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
    }
}

@injectable()
export class FileCommandContribution implements CommandContribution {
    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(ClipboardService) protected readonly clipboardService: ClipboardService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) { }

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
            label: 'Open'
        });
        registry.registerCommand({
            id: Commands.FILE_RENAME,
            label: 'Rename'
        });
        registry.registerCommand({
            id: Commands.FILE_DELETE,
            label: 'Delete'
        });

        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = Commands.FILE_OPEN_WITH(opener);
                registry.registerCommand(openWithCommand);
                registry.registerHandler(openWithCommand.id,
                    new FileSystemCommandHandler(this.selectionService, uri => {
                        return opener.open(uri);
                    })
                );
            }
        });

        registry.registerHandler(
            Commands.FILE_RENAME,
            new FileSystemCommandHandler(this.selectionService, uri => {
                return this.fileSystem.getFileStat(uri.toString())
                    .then(stat => {
                        let dialog = new SingleTextInputDialog('Rename File', {
                            initialValue: uri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then(name =>
                            this.fileSystem.move(uri.toString(), uri.parent.appendPath(name).toString()))
                    })
            })
        );

        registry.registerHandler(
            Commands.FILE_COPY,
            new FileSystemCommandHandler(this.selectionService, uri => {
                this.clipboardService.setData({
                    text: uri.toString()
                })
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            Commands.FILE_PASTE,
            new FileSystemCommandHandler(this.selectionService, uri => {
                let copyPath: URI
                return getDirectory(uri, this.fileSystem)
                    .then(stat => {
                        let data: string = this.clipboardService.getData('text')
                        copyPath = new URI(data)
                        let targetUri = uri.appendPath(copyPath.lastSegment)
                        return this.fileSystem.copy(copyPath.toString(), targetUri.toString())
                    })
            }, uri => !this.clipboardService.isEmpty && !!this.clipboardService.getData('text'))
        );

        registry.registerHandler(
            Commands.NEW_FILE,
            new FileSystemCommandHandler(this.selectionService, uri => {
                return getDirectory(uri, this.fileSystem)
                    .then(stat => {
                        let freeUri = getFreeChild('Untitled', '.txt', stat)
                        let dialog = new SingleTextInputDialog(`New File Below '${freeUri.parent.lastSegment}'`, {
                            initialValue: freeUri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then(name =>
                            this.fileSystem.createFile(new URI(stat.uri).appendPath(name).toString()))
                    })
            })
        );

        registry.registerHandler(
            Commands.NEW_FOLDER,
            new FileSystemCommandHandler(this.selectionService, uri => {
                return getDirectory(uri, this.fileSystem)
                    .then(stat => {
                        let freeUri = getFreeChild('Untitled', '', stat)
                        let dialog = new SingleTextInputDialog(`New Folder Below '${freeUri.parent.lastSegment}'`, {
                            initialValue: freeUri.lastSegment,
                            validate(name) {
                                return validateFileName(name, stat)
                            }
                        })
                        dialog.acceptancePromise.then(name =>
                            this.fileSystem.createFolder(new URI(stat.uri).appendPath(name).toString()))
                    })
            })
        )

        registry.registerHandler(
            Commands.FILE_DELETE,
            new FileSystemCommandHandler(this.selectionService, uri => {
                let dialog = new ConfirmDialog('Delete File', `Do you really want to delete '${uri.lastSegment}'?`)
                return dialog.acceptancePromise.then(() => {
                    return this.fileSystem.delete(uri.toString())
                })
            })
        )

        registry.registerHandler(
            Commands.FILE_OPEN,
            new FileSystemCommandHandler(this.selectionService,
                uri => open(this.openerService, uri)
            )
        );
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
        .then(stat => {
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
        if (!children.some(stat => new URI(stat.uri).lastSegment === candidate)) {
            return parentUri.appendPath(candidate)
        }
    }
    return parentUri.appendPath(prefix + suffix)
}

export class FileSystemCommandHandler implements CommandHandler {
    constructor(
        protected readonly selectionService: SelectionService,
        protected readonly doExecute: (uri: URI) => any,
        protected readonly testEnabled?: (uri: URI) => boolean
    ) { }

    protected get uri(): URI | undefined {
        return UriSelection.getUri(this.selectionService.selection);
    }

    execute(): any {
        const uri = this.uri;
        return uri ? this.doExecute(uri) : undefined;
    }

    isVisible(): boolean {
        return !!this.uri;
    }

    isEnabled(): boolean {
        const uri = this.uri;
        if (uri) {
            if (this.testEnabled) {
                return this.testEnabled(uri);
            }
            return true;
        }
        return false;
    }

}
