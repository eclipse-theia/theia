/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { FileStatNode, FileDialogService } from '@theia/filesystem/lib/browser';
import { SingleTextInputDialog, ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { OpenerService, OpenHandler, open, FrontendApplication } from '@theia/core/lib/browser';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspacePreferences } from './workspace-preferences';
import { WorkspaceDeleteHandler } from './workspace-delete-handler';

const validFilename: (arg: string) => boolean = require('valid-filename');

export namespace WorkspaceCommands {
    export const OPEN: Command = {
        id: 'workspace:open',
        label: 'Open...'
    };
    export const OPEN_RECENT_WORKSPACE: Command = {
        id: 'workspace:openRecent',
        label: 'Open Recent Workspace...'
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
    export const ADD_FOLDER: Command = {
        id: 'workspace:addFolder',
        label: 'Add Folder to Workspace...'
    };
    export const REMOVE_FOLDER: Command = {
        id: 'workspace:removeFolder'
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

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FrontendApplication) protected readonly app: FrontendApplication;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(WorkspacePreferences) protected readonly preferences: WorkspacePreferences;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(WorkspaceDeleteHandler) protected readonly deleteHandler: WorkspaceDeleteHandler;

    registerCommands(registry: CommandRegistry): void {
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerCommand(openWithCommand, this.newUriAwareCommandHandler({
                    execute: uri => opener.open(uri),
                    isEnabled: uri => opener.canHandle(uri) > 0,
                    isVisible: uri => opener.canHandle(uri) > 0
                }));
            }
        });
        registry.registerCommand(WorkspaceCommands.NEW_FILE, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = new URI(parent.uri);
                    const vacantChildUri = this.findVacantChildUri(parentUri, parent, 'Untitled', '.txt');
                    const dialog = new SingleTextInputDialog({
                        title: 'New File',
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name => {
                        if (name) {
                            const fileUri = parentUri.resolve(name);
                            this.fileSystem.createFile(fileUri.toString()).then(() => {
                                open(this.openerService, fileUri);
                            });
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.NEW_FOLDER, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = new URI(parent.uri);
                    const vacantChildUri = this.findVacantChildUri(parentUri, parent, 'Untitled');
                    const dialog = new SingleTextInputDialog({
                        title: 'New Folder',
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name => {
                        if (name) {
                            this.fileSystem.createFolder(parentUri.resolve(name).toString());
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_RENAME, this.newUriAwareCommandHandler({
            execute: uri => this.getParent(uri).then(parent => {
                if (parent) {
                    const dialog = new SingleTextInputDialog({
                        title: 'Rename File',
                        initialValue: uri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name => {
                        if (name) {
                            this.fileSystem.move(uri.toString(), uri.parent.resolve(name).toString());
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_DELETE, this.newMultiUriAwareCommandHandler(this.deleteHandler));
        registry.registerCommand(WorkspaceCommands.FILE_COMPARE, this.newMultiUriAwareCommandHandler({
            isVisible: uris => uris.length === 2,
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
                    if (leftStat && rightStat) {
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
            }
        }));
        this.preferences.ready.then(() => {
            const isEnabled = () => this.workspaceService.isMultiRootWorkspaceOpened;
            const isVisible = (uris: URI[]): boolean => {
                const roots = this.workspaceService.tryGetRoots();
                const selected = new Set(uris.map(u => u.toString()));
                for (const root of roots) {
                    if (selected.has(root.uri)) {
                        return true;
                    }
                }
                return false;
            };
            registry.registerCommand(WorkspaceCommands.ADD_FOLDER, this.newMultiUriAwareCommandHandler({
                isEnabled,
                isVisible,
                execute: async uris => {
                    const node = await this.fileDialogService.show({ title: WorkspaceCommands.ADD_FOLDER.label! });
                    this.addFolderToWorkspace(node);
                }
            }));
            registry.registerCommand(WorkspaceCommands.REMOVE_FOLDER, this.newMultiUriAwareCommandHandler({
                execute: uris => this.removeFolderFromWorkspace(uris),
                isEnabled,
                isVisible
            }));
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return new UriAwareCommandHandler(this.selectionService, handler, { multi: true });
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
            return 'Invalid name, try other';
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

    protected async getDirectory(candidate: URI): Promise<FileStat | undefined> {
        const stat = await this.fileSystem.getFileStat(candidate.toString());
        if (stat && stat.isDirectory) {
            return stat;
        }
        return this.getParent(candidate);
    }

    protected getParent(candidate: URI): Promise<FileStat | undefined> {
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

    protected addFolderToWorkspace(node: Readonly<FileStatNode> | undefined): void {
        if (!node) {
            return;
        }
        if (node.fileStat.isDirectory) {
            this.workspaceService.addRoot(node.uri);
        } else {
            throw new Error(`Invalid folder. URI: ${node.fileStat.uri}.`);
        }
    }

    protected async removeFolderFromWorkspace(uris: URI[]): Promise<void> {
        const roots = new Set(this.workspaceService.tryGetRoots().map(r => r.uri));
        const toRemove = uris.filter(u => roots.has(u.toString()));
        if (toRemove.length > 0) {
            const messageContainer = document.createElement('div');
            messageContainer.textContent = 'Remove the following folders from workspace? (note: nothing will be erased from disk)';
            const list = document.createElement('ul');
            list.style.listStyleType = 'none';
            toRemove.forEach(u => {
                const listItem = document.createElement('li');
                listItem.textContent = u.displayName;
                list.appendChild(listItem);
            });
            messageContainer.appendChild(list);
            const dialog = new ConfirmDialog({
                title: 'Remove Folder from Workspace',
                msg: messageContainer
            });
            if (await dialog.open()) {
                await this.workspaceService.removeRoots(toRemove);
            }
        } else {
            throw new Error('Expected at least one root folder location.');
        }
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
        workspaceService.roots.then(roots => {
            const root = roots[0];
            if (root) {
                this.rootUri = new URI(root.uri);
            }
        });
    }

    protected getUri(): URI | undefined {
        return super.getUri() || this.rootUri;
    }

}
