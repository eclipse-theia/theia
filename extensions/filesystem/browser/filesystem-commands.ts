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

export namespace FileCommands {
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

export namespace FileMenus {
    export const FILE = [MAIN_MENU_BAR, "1_file"];
    export const NEW_GROUP = [...FILE, '1_new'];
    export const OPEN_GROUP = [...FILE, '2_open'];
}

@injectable()
export class FileMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        // Explicitly register the Edit Submenu
        registry.registerSubmenu([MAIN_MENU_BAR], FileMenus.FILE[1], "File");

        registry.registerMenuAction(FileMenus.NEW_GROUP, {
            commandId: FileCommands.NEW_FILE
        });
        registry.registerMenuAction(FileMenus.NEW_GROUP, {
            commandId: FileCommands.NEW_FOLDER
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

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({
            id: FileCommands.NEW_FILE,
            label: 'New File'
        });
        registry.registerCommand({
            id: FileCommands.NEW_FOLDER,
            label: 'New Folder'
        });
        registry.registerCommand({
            id: FileCommands.FILE_OPEN,
            label: 'Open'
        });
        registry.registerCommand({
            id: FileCommands.FILE_RENAME,
            label: 'Rename'
        });
        registry.registerCommand({
            id: FileCommands.FILE_DELETE,
            label: 'Delete'
        });

        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = FileCommands.FILE_OPEN_WITH(opener);
                registry.registerCommand(openWithCommand);
                registry.registerHandler(openWithCommand.id,
                    new FileSystemCommandHandler(this.selectionService, uri => {
                        return opener.open(uri);
                    })
                );
            }
        });

        registry.registerHandler(
            FileCommands.FILE_RENAME,
            new FileSystemCommandHandler(this.selectionService, uri =>
                this.getParent(uri).then(parent => {
                    const dialog = new SingleTextInputDialog({
                        title: 'Rename File',
                        initialValue: uri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name =>
                        this.fileSystem.move(uri.toString(), uri.parent.resolve(name).toString())
                    )
                })
            )
        );

        registry.registerHandler(
            FileCommands.FILE_COPY,
            new FileSystemCommandHandler(this.selectionService, uri => {
                this.clipboardService.setData({
                    text: uri.toString()
                })
                return Promise.resolve()
            })
        );

        registry.registerHandler(
            FileCommands.FILE_PASTE,
            new FileSystemCommandHandler(this.selectionService, uri =>
                this.getDirectory(uri).then(stat => {
                    const data: string = this.clipboardService.getData('text');
                    const copyPath = new URI(data);
                    const targetUri = uri.resolve(copyPath.path.base);
                    return this.fileSystem.copy(copyPath.toString(), targetUri.toString());
                }),
                uri => !this.clipboardService.isEmpty && !!this.clipboardService.getData('text'))
        );

        registry.registerHandler(
            FileCommands.NEW_FILE,
            new FileSystemCommandHandler(this.selectionService, uri =>
                this.getDirectory(uri).then(parent => {
                    const parentUri = new URI(parent.uri);
                    const vacantChildUri = this.findVacantChildUri(parentUri, parent, 'Untitled', '.txt');
                    const dialog = new SingleTextInputDialog({
                        title: `New File`,
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    })
                    dialog.open().then(name => {
                        const fileUri = parentUri.resolve(name);
                        this.fileSystem.createFile(fileUri.toString()).then(() => {
                            open(this.openerService, fileUri)
                        });
                    })
                })
            )
        );

        registry.registerHandler(
            FileCommands.NEW_FOLDER,
            new FileSystemCommandHandler(this.selectionService, uri =>
                this.getDirectory(uri).then(parent => {
                    const parentUri = new URI(parent.uri);
                    const vacantChildUri = this.findVacantChildUri(parentUri, parent, 'Untitled');
                    const dialog = new SingleTextInputDialog({
                        title: `New Folder`,
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name =>
                        this.fileSystem.createFolder(parentUri.resolve(name).toString())
                    );
                })
            )
        )

        registry.registerHandler(
            FileCommands.FILE_DELETE,
            new FileSystemCommandHandler(this.selectionService, uri => {
                const dialog = new ConfirmDialog({
                    title: 'Delete File',
                    msg: `Do you really want to delete '${uri.path.base}'?`
                });
                return dialog.open().then(() => {
                    return this.fileSystem.delete(uri.toString())
                });
            })
        )

        registry.registerHandler(
            FileCommands.FILE_OPEN,
            new FileSystemCommandHandler(this.selectionService,
                uri => open(this.openerService, uri)
            )
        );
    }

    /**
     * returns an error message or an empty string if the file name is valid
     * @param name the simple file name to validate
     * @param parent the parent directory's file stat
     */
    protected validateFileName(name: string, parent: FileStat): string {
        if (!name || !name.match(/^[\w\-. ]+$/)) {
            return "Invalid name, try other";
        }
        if (parent.children) {
            for (const child of parent.children) {
                if (new URI(child.uri).path.base === name) {
                    return 'A file with this name already exists.';
                }
            }
        }
        return '';
    }

    protected async getDirectory(candidate: URI): Promise<FileStat> {
        const stat = await this.fileSystem.getFileStat(candidate.toString());
        if (stat.isDirectory) {
            return stat;
        }
        return this.getParent(candidate);
    }

    protected getParent(candidate: URI): Promise<FileStat> {
        return this.fileSystem.getFileStat(candidate.parent.toString());
    }

    protected findVacantChildUri(parentUri: URI, parent: FileStat, name: string, ext: string = ''): URI {
        const children = !parent.children ? [] : parent.children!.map(child => new URI(child.uri));

        let index = 1;
        let base = name + ext;
        while (children.some(child => child.path.base === base)) {
            index = index + 1;
            base = name + '_' + index + ext;
        }
        return parentUri.resolve(base);
    }
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
