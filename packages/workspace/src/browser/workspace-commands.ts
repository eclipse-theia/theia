/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { SingleTextInputDialog, ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { OpenerService, OpenHandler, open, FrontendApplication } from '@theia/core/lib/browser';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';
import { MessageService } from '@theia/core/lib/common/message-service';

const validFilename: (arg: string) => boolean = require('valid-filename');

export namespace WorkspaceCommands {
    export const OPEN: Command = {
        id: 'workspace:open',
        label: 'Open...'
    };
    export const CLOSE: Command = {
        id: 'workspace:close',
        label: 'Close Workspace'
    };
    export const NEW_FILE: Command = {
        id: 'file.newFile',
        label: 'New File'
    };
    export const NEW_FOLDER: Command = {
        id: 'file.newFolder',
        label: 'New Folder'
    };
    export const FILE_OPEN_WITH = (opener: OpenHandler): Command => ({
        id: `file.openWith.${opener.id}`,
        label: opener.label,
        iconClass: opener.iconClass
    });
    export const FILE_RENAME: Command = {
        id: 'file.rename',
        label: 'Rename'
    };
    export const FILE_DELETE: Command = {
        id: 'file.delete',
        label: 'Delete'
    };
    export const FILE_COMPARE: Command = {
        id: 'file.compare',
        label: 'Compare with Each Other'
    };
}

@injectable()
export class FileMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: WorkspaceCommands.NEW_FILE.id
        });
        registry.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: WorkspaceCommands.NEW_FOLDER.id
        });
    }

}

@injectable()
export class WorkspaceCommandContribution implements CommandContribution {

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(MessageService) protected readonly messageService: MessageService,
    ) { }

    registerCommands(registry: CommandRegistry): void {
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerCommand(openWithCommand, this.newUriAwareCommandHandler({
                    execute: uri => opener.open(uri),
                    isEnabled: uri => opener.canHandle(uri) !== 0,
                    isVisible: uri => opener.canHandle(uri) !== 0
                }));
            }
        });
        registry.registerCommand(WorkspaceCommands.NEW_FILE, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                const parentUri = new URI(parent.uri);
                const vacantChildUri = this.findVacantChildUri(parentUri, parent, 'Untitled', '.txt');
                const dialog = new SingleTextInputDialog({
                    title: `New File`,
                    initialValue: vacantChildUri.path.base,
                    validate: name => this.validateFileName(name, parent)
                });
                dialog.open().then(name => {
                    const fileUri = parentUri.resolve(name);
                    this.fileSystem.createFile(fileUri.toString()).then(() => {
                        open(this.openerService, fileUri);
                    });
                });
            })
        }));
        registry.registerCommand(WorkspaceCommands.NEW_FOLDER, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
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
        }));
        registry.registerCommand(WorkspaceCommands.FILE_RENAME, this.newUriAwareCommandHandler({
            execute: uri => this.getParent(uri).then(parent => {
                const dialog = new SingleTextInputDialog({
                    title: 'Rename File',
                    initialValue: uri.path.base,
                    validate: name => this.validateFileName(name, parent)
                });
                dialog.open().then(name =>
                    this.fileSystem.move(uri.toString(), uri.parent.resolve(name).toString())
                );
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_DELETE, this.newMultiUriAwareCommandHandler({
            execute: async uris => {
                const msg = (() => {
                    if (uris.length === 1) {
                        return `Do you really want to delete ${uris[0].path.base}?`;
                    }
                    if (uris.length > 10) {
                        return `Do you really want to delete all the ${uris.length} selected files?`;
                    }
                    const messageContainer = document.createElement('div');
                    messageContainer.textContent = 'Do you really want to delete the following files?';
                    const list = document.createElement('ul');
                    list.style.listStyleType = 'none';
                    for (const uri of uris) {
                        const listItem = document.createElement('li');
                        listItem.textContent = uri.path.base;
                        list.appendChild(listItem);
                    }
                    messageContainer.appendChild(list);
                    return messageContainer;
                })();
                const dialog = new ConfirmDialog({
                    title: `Delete File${uris.length === 1 ? '' : 's'}`,
                    msg,
                });
                if (await dialog.open()) {
                    // Make sure we delete the longest paths first, they might be nested. Longer paths come first.
                    uris.sort((left, right) => right.toString().length - left.toString().length);
                    await Promise.all(uris.map(uri => uri.toString()).map(uri => this.fileSystem.delete(uri)));
                }
            }
        }));
        registry.registerCommand(WorkspaceCommands.FILE_COMPARE, this.newMultiUriAwareCommandHandler({
            execute: async uris => {
                const [left, right] = uris;
                const [leftExists, rightExists] = await Promise.all([
                    this.fileSystem.exists(left.toString()),
                    this.fileSystem.exists(right.toString())
                ]);
                if (leftExists && rightExists) {
                    const [leftStat, rightStat] = await Promise.all([
                        this.fileSystem.getFileStat(left.toString()),
                        this.fileSystem.getFileStat(right.toString()),
                    ]);
                    if (!leftStat.isDirectory && !rightStat.isDirectory) {
                        const uri = DiffUris.encode(left, right);
                        const opener = await this.openerService.getOpener(uri);
                        opener.open(uri);
                    } else {
                        const details = (() => {
                            if (leftStat.isDirectory && rightStat.isDirectory) {
                                return 'Both resource were a directory.';
                            } else {
                                if (leftStat.isDirectory) {
                                    return `'${left.path.base}' was a directory.`;
                                } else {
                                    return `'${right.path.base}' was a directory.`;
                                }
                            }
                        });
                        this.messageService.warn(`Directories cannot be compared. ${details()}`);
                    }
                }
            }
            // Ideally, we would have to check whether both the URIs represent an individual file, but we cannot make synchronous validation here :(
        }, uris => uris.length === 2));
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>, isValid: (uris: URI[]) => boolean = uris => uris.length > 0): UriAwareCommandHandler<URI[]> {
        return new UriAwareCommandHandler(this.selectionService, handler, { multi: true, isValid });
    }

    protected newWorkspaceRootUriAwareCommandHandler(handler: UriCommandHandler<URI>): WorkspaceRootUriAwareCommandHandler {
        return new WorkspaceRootUriAwareCommandHandler(this.workspaceService, this.selectionService, handler);
    }

    /**
     * Returns an error message if the file name is invalid. Otherwise, an empty string.
     *
     * @param name the simple file name of the file to validate.
     * @param parent the parent directory's file stat.
     */
    protected validateFileName(name: string, parent: FileStat): string {
        if (!validFilename(name)) {
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

export class WorkspaceRootUriAwareCommandHandler extends UriAwareCommandHandler<URI> {

    protected rootUri: URI | undefined;

    constructor(
        protected readonly workspaceService: WorkspaceService,
        protected readonly selectionService: SelectionService,
        protected readonly handler: UriCommandHandler<URI>
    ) {
        super(selectionService, handler);
        workspaceService.root.then(root => {
            if (root) {
                this.rootUri = new URI(root.uri);
            }
        });
    }

    protected getUri(): URI | undefined {
        return super.getUri() || this.rootUri;
    }

}
