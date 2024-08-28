// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { SingleTextInputDialog, ConfirmDialog, Dialog } from '@theia/core/lib/browser/dialogs';
import { OpenerService, OpenHandler, open, FrontendApplication, LabelProvider, CommonCommands } from '@theia/core/lib/browser';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspacePreferences } from './workspace-preferences';
import { WorkspaceDeleteHandler } from './workspace-delete-handler';
import { WorkspaceDuplicateHandler } from './workspace-duplicate-handler';
import { FileSystemUtils } from '@theia/filesystem/lib/common';
import { WorkspaceCompareHandler } from './workspace-compare-handler';
import { FileDownloadCommands } from '@theia/filesystem/lib/browser/download/file-download-command-contribution';
import { FileSystemCommands } from '@theia/filesystem/lib/browser/filesystem-frontend-contribution';
import { WorkspaceInputDialog } from './workspace-input-dialog';
import { Emitter, EOL, Event, OS } from '@theia/core/lib/common';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { nls } from '@theia/core/lib/common/nls';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';

const validFilename: (arg: string) => boolean = require('valid-filename');

export namespace WorkspaceCommands {

    const WORKSPACE_CATEGORY = 'Workspaces';
    const FILE_CATEGORY = CommonCommands.FILE_CATEGORY;

    // On Linux and Windows, both files and folders cannot be opened at the same time in electron.
    // `OPEN_FILE` and `OPEN_FOLDER` must be available only on Linux and Windows in electron.
    // `OPEN` must *not* be available on Windows and Linux in electron.
    // VS Code does the same. See: https://github.com/eclipse-theia/theia/pull/3202#issuecomment-430585357
    export const OPEN: Command & { dialogLabel: string } = {
        ...Command.toDefaultLocalizedCommand({
            id: 'workspace:open',
            category: CommonCommands.FILE_CATEGORY,
            label: 'Open...'
        }),
        dialogLabel: nls.localizeByDefault('Open')
    };
    // No `label`. Otherwise, it shows up in the `Command Palette`.
    export const OPEN_FILE: Command & { dialogLabel: string } = {
        id: 'workspace:openFile',
        originalCategory: FILE_CATEGORY,
        category: nls.localizeByDefault(CommonCommands.FILE_CATEGORY),
        dialogLabel: nls.localizeByDefault('Open File')
    };
    export const OPEN_FOLDER: Command & { dialogLabel: string } = {
        id: 'workspace:openFolder',
        dialogLabel: nls.localizeByDefault('Open Folder') // No `label`. Otherwise, it shows up in the `Command Palette`.
    };
    export const OPEN_WORKSPACE: Command & { dialogLabel: string } = {
        ...Command.toDefaultLocalizedCommand({
            id: 'workspace:openWorkspace',
            category: CommonCommands.FILE_CATEGORY,
            label: 'Open Workspace from File...',
        }),
        dialogLabel: nls.localizeByDefault('Open Workspace from File')
    };
    export const OPEN_RECENT_WORKSPACE = Command.toLocalizedCommand({
        id: 'workspace:openRecent',
        category: FILE_CATEGORY,
        label: 'Open Recent Workspace...'
    }, 'theia/workspace/openRecentWorkspace', CommonCommands.FILE_CATEGORY_KEY);
    export const CLOSE = Command.toDefaultLocalizedCommand({
        id: 'workspace:close',
        category: WORKSPACE_CATEGORY,
        label: 'Close Workspace'
    });
    export const NEW_FILE = Command.toDefaultLocalizedCommand({
        id: 'file.newFile',
        category: FILE_CATEGORY,
        label: 'New File...'
    });
    export const NEW_FOLDER = Command.toDefaultLocalizedCommand({
        id: 'file.newFolder',
        category: FILE_CATEGORY,
        label: 'New Folder...'
    });
    /** @deprecated Use the `OpenWithService` instead */
    export const FILE_OPEN_WITH = (opener: OpenHandler): Command => ({
        id: `file.openWith.${opener.id}`
    });
    export const FILE_RENAME = Command.toDefaultLocalizedCommand({
        id: 'file.rename',
        category: FILE_CATEGORY,
        label: 'Rename'
    });
    export const FILE_DELETE = Command.toDefaultLocalizedCommand({
        id: 'file.delete',
        category: FILE_CATEGORY,
        label: 'Delete'
    });
    export const FILE_DUPLICATE = Command.toLocalizedCommand({
        id: 'file.duplicate',
        category: FILE_CATEGORY,
        label: 'Duplicate'
    }, 'theia/workspace/duplicate', CommonCommands.FILE_CATEGORY_KEY);
    export const FILE_COMPARE = Command.toLocalizedCommand({
        id: 'file.compare',
        category: FILE_CATEGORY,
        label: 'Compare with Each Other'
    }, 'theia/workspace/compareWithEachOther', CommonCommands.FILE_CATEGORY_KEY);
    export const ADD_FOLDER = Command.toDefaultLocalizedCommand({
        id: 'workspace:addFolder',
        category: WORKSPACE_CATEGORY,
        label: 'Add Folder to Workspace...'
    });
    export const REMOVE_FOLDER = Command.toDefaultLocalizedCommand({
        id: 'workspace:removeFolder',
        category: WORKSPACE_CATEGORY,
        label: 'Remove Folder from Workspace'
    });
    export const SAVE_WORKSPACE_AS = Command.toDefaultLocalizedCommand({
        id: 'workspace:saveAs',
        category: WORKSPACE_CATEGORY,
        label: 'Save Workspace As...'
    });
    export const OPEN_WORKSPACE_FILE = Command.toDefaultLocalizedCommand({
        id: 'workspace:openConfigFile',
        category: WORKSPACE_CATEGORY,
        label: 'Open Workspace Configuration File'
    });
    /** @deprecated @since 1.24.0 Use `CommonCommands.SAVE_AS` instead */
    export const SAVE_AS = CommonCommands.SAVE_AS;
    export const COPY_RELATIVE_FILE_PATH = Command.toDefaultLocalizedCommand({
        id: 'navigator.copyRelativeFilePath',
        label: 'Copy Relative Path'
    });
}

@injectable()
export class FileMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.FILE_NEW_TEXT, {
            commandId: WorkspaceCommands.NEW_FOLDER.id,
            order: 'b'
        });
        const downloadUploadMenu = [...CommonMenus.FILE, '4_downloadupload'];
        registry.registerMenuAction(downloadUploadMenu, {
            commandId: FileSystemCommands.UPLOAD.id,
            order: 'a'
        });
        registry.registerMenuAction(downloadUploadMenu, {
            commandId: FileDownloadCommands.DOWNLOAD.id,
            order: 'b'
        });
    }

}

@injectable()
export class EditMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(CommonMenus.EDIT_CLIPBOARD, {
            commandId: FileDownloadCommands.COPY_DOWNLOAD_LINK.id,
            order: '9999'
        });
    }

}

export interface DidCreateNewResourceEvent {
    uri: URI
    parent: URI
}

@injectable()
export class WorkspaceCommandContribution implements CommandContribution {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FrontendApplication) protected readonly app: FrontendApplication;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(WorkspacePreferences) protected readonly preferences: WorkspacePreferences;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(WorkspaceDeleteHandler) protected readonly deleteHandler: WorkspaceDeleteHandler;
    @inject(WorkspaceDuplicateHandler) protected readonly duplicateHandler: WorkspaceDuplicateHandler;
    @inject(WorkspaceCompareHandler) protected readonly compareHandler: WorkspaceCompareHandler;
    @inject(ClipboardService) protected readonly clipboardService: ClipboardService;

    private readonly onDidCreateNewFileEmitter = new Emitter<DidCreateNewResourceEvent>();
    private readonly onDidCreateNewFolderEmitter = new Emitter<DidCreateNewResourceEvent>();

    get onDidCreateNewFile(): Event<DidCreateNewResourceEvent> {
        return this.onDidCreateNewFileEmitter.event;
    }

    get onDidCreateNewFolder(): Event<DidCreateNewResourceEvent> {
        return this.onDidCreateNewFolderEmitter.event;
    }

    protected fireCreateNewFile(uri: DidCreateNewResourceEvent): void {
        this.onDidCreateNewFileEmitter.fire(uri);
    }

    protected fireCreateNewFolder(uri: DidCreateNewResourceEvent): void {
        this.onDidCreateNewFolderEmitter.fire(uri);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(WorkspaceCommands.NEW_FILE, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = parent.resource;
                    const { fileName, fileExtension } = this.getDefaultFileConfig();
                    const targetUri = parentUri.resolve(fileName + fileExtension);
                    const vacantChildUri = FileSystemUtils.generateUniqueResourceURI(parent, targetUri, false);

                    const dialog = new WorkspaceInputDialog({
                        title: nls.localizeByDefault('New File...'),
                        maxWidth: 400,
                        parentUri: parentUri,
                        initialValue: vacantChildUri.path.base,
                        placeholder: nls.localize('theia/workspace/newFilePlaceholder', 'File Name'),
                        validate: name => this.validateFileName(name, parent, true)
                    }, this.labelProvider);

                    dialog.open().then(async name => {
                        if (name) {
                            const fileUri = parentUri.resolve(name);
                            await this.fileService.create(fileUri);
                            this.fireCreateNewFile({ parent: parentUri, uri: fileUri });
                            open(this.openerService, fileUri);
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.NEW_FOLDER, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = parent.resource;
                    const targetUri = parentUri.resolve('Untitled');
                    const vacantChildUri = FileSystemUtils.generateUniqueResourceURI(parent, targetUri, true);
                    const dialog = new WorkspaceInputDialog({
                        title: nls.localizeByDefault('New Folder...'),
                        maxWidth: 400,
                        parentUri: parentUri,
                        initialValue: vacantChildUri.path.base,
                        placeholder: nls.localize('theia/workspace/newFolderPlaceholder', 'Folder Name'),
                        validate: name => this.validateFileName(name, parent, true)
                    }, this.labelProvider);
                    dialog.open().then(async name => {
                        if (name) {
                            const folderUri = parentUri.resolve(name);
                            await this.fileService.createFolder(folderUri);
                            this.fireCreateNewFile({ parent: parentUri, uri: folderUri });
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_RENAME, this.newMultiUriAwareCommandHandler({
            isEnabled: uris => uris.some(uri => !this.isWorkspaceRoot(uri)) && uris.length === 1,
            isVisible: uris => uris.some(uri => !this.isWorkspaceRoot(uri)) && uris.length === 1,
            execute: async uris => {
                const uri = uris[0]; /* Since there is only one item in the array. */
                const parent = await this.getParent(uri);
                if (parent) {
                    const oldName = uri.path.base;
                    const dialog = new SingleTextInputDialog({
                        title: nls.localizeByDefault('Rename'),
                        maxWidth: 400,
                        initialValue: oldName,
                        initialSelectionRange: {
                            start: 0,
                            end: uri.path.name.length
                        },
                        validate: async (newName, mode) => {
                            if (oldName === newName && mode === 'preview') {
                                return false;
                            }
                            return this.validateFileRename(oldName, newName, parent);
                        }
                    });
                    const fileName = await dialog.open();
                    if (fileName) {
                        const oldUri = uri;
                        const newUri = uri.parent.resolve(fileName);
                        return this.fileService.move(oldUri, newUri);
                    }
                }
            }
        }));
        registry.registerCommand(WorkspaceCommands.FILE_DUPLICATE, this.newMultiUriAwareCommandHandler(this.duplicateHandler));
        registry.registerCommand(WorkspaceCommands.FILE_DELETE, this.newMultiUriAwareCommandHandler(this.deleteHandler));
        registry.registerCommand(WorkspaceCommands.FILE_COMPARE, this.newMultiUriAwareCommandHandler(this.compareHandler));
        registry.registerCommand(WorkspaceCommands.COPY_RELATIVE_FILE_PATH, UriAwareCommandHandler.MultiSelect(this.selectionService, {
            isEnabled: uris => !!uris.length,
            isVisible: uris => !!uris.length,
            execute: async uris => {
                const lineDelimiter = EOL;
                const text = uris.map((uri: URI) => {
                    const workspaceRoot = this.workspaceService.getWorkspaceRootUri(uri);
                    if (workspaceRoot) {
                        return workspaceRoot.relative(uri)?.fsPath();
                    } else {
                        return uri.path.fsPath();
                    }
                }).join(lineDelimiter);
                await this.clipboardService.writeText(text);
            }
        }));
        registry.registerCommand(WorkspaceCommands.ADD_FOLDER, {
            isEnabled: () => this.workspaceService.opened,
            isVisible: () => this.workspaceService.opened,
            execute: async () => {
                const selection = await this.fileDialogService.showOpenDialog({
                    title: WorkspaceCommands.ADD_FOLDER.label!,
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: true,
                });
                if (!selection) {
                    return;
                }
                const uris = Array.isArray(selection) ? selection : [selection];
                const workspaceSavedBeforeAdding = this.workspaceService.saved;
                await this.addFolderToWorkspace(...uris);
                if (!workspaceSavedBeforeAdding) {
                    this.saveWorkspaceWithPrompt(registry);
                }
            }
        });
        registry.registerCommand(WorkspaceCommands.REMOVE_FOLDER, this.newMultiUriAwareCommandHandler({
            execute: uris => this.removeFolderFromWorkspace(uris),
            isEnabled: () => this.workspaceService.isMultiRootWorkspaceOpened,
            isVisible: uris => this.areWorkspaceRoots(uris) && this.workspaceService.saved
        }));
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return UriAwareCommandHandler.MonoSelect(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return UriAwareCommandHandler.MultiSelect(this.selectionService, handler);
    }

    protected newWorkspaceRootUriAwareCommandHandler(handler: UriCommandHandler<URI>): WorkspaceRootUriAwareCommandHandler {
        return new WorkspaceRootUriAwareCommandHandler(this.workspaceService, this.selectionService, handler);
    }

    protected async validateFileRename(oldName: string, newName: string, parent: FileStat): Promise<string> {
        if (OS.backend.isWindows && parent.resource.resolve(newName).isEqual(parent.resource.resolve(oldName), false)) {
            return '';
        }
        return this.validateFileName(newName, parent, false);
    }

    /**
     * Returns an error message if the file name is invalid. Otherwise, an empty string.
     *
     * @param name the simple file name of the file to validate.
     * @param parent the parent directory's file stat.
     * @param allowNested allow file or folder creation using recursive path
     */
    protected async validateFileName(name: string, parent: FileStat, allowNested: boolean = false): Promise<string> {
        if (!name) {
            return '';
        }
        // do not allow recursive rename
        if (!allowNested && !validFilename(name)) {
            return nls.localizeByDefault('The name **{0}** is not valid as a file or folder name. Please choose a different name.');
        }
        if (name.startsWith('/')) {
            return nls.localizeByDefault('A file or folder name cannot start with a slash.');
        } else if (name.startsWith(' ') || name.endsWith(' ')) {
            return nls.localizeByDefault('Leading or trailing whitespace detected in file or folder name.');
        }
        // check and validate each sub-paths
        if (name.split(/[\\/]/).some(file => !file || !validFilename(file) || /^\s+$/.test(file))) {
            return nls.localizeByDefault('\'{0}\' is not a valid file name', this.trimFileName(name));
        }
        const childUri = parent.resource.resolve(name);
        const exists = await this.fileService.exists(childUri);
        if (exists) {
            return nls.localizeByDefault('A file or folder **{0}** already exists at this location. Please choose a different name.', this.trimFileName(name));
        }
        return '';
    }

    protected trimFileName(name: string): string {
        if (name && name.length > 30) {
            return `${name.substring(0, 30)}...`;
        }
        return name;
    }

    protected async getDirectory(candidate: URI): Promise<FileStat | undefined> {
        let stat: FileStat | undefined;
        try {
            stat = await this.fileService.resolve(candidate);
        } catch { }
        if (stat && stat.isDirectory) {
            return stat;
        }
        return this.getParent(candidate);
    }

    protected async getParent(candidate: URI): Promise<FileStat | undefined> {
        try {
            return await this.fileService.resolve(candidate.parent);
        } catch {
            return undefined;
        }
    }

    protected async addFolderToWorkspace(...uris: URI[]): Promise<void> {
        if (uris.length) {
            const foldersToAdd = [];
            try {
                for (const uri of uris) {
                    const stat = await this.fileService.resolve(uri);
                    if (stat.isDirectory) {
                        foldersToAdd.push(uri);
                    }
                }
                await this.workspaceService.addRoot(foldersToAdd);
            } catch { }
        }
    }

    protected areWorkspaceRoots(uris: URI[]): boolean {
        return this.workspaceService.areWorkspaceRoots(uris);
    }

    protected isWorkspaceRoot(uri: URI): boolean {
        const rootUris = new Set(this.workspaceService.tryGetRoots().map(root => root.resource.toString()));
        return rootUris.has(uri.toString());
    }

    protected getDefaultFileConfig(): { fileName: string, fileExtension: string } {
        return {
            fileName: 'Untitled',
            fileExtension: '.txt'
        };
    }

    /**
     * Removes the list of folders from the workspace upon confirmation from the user.
     * @param uris the list of folder uris to remove.
     */
    protected async removeFolderFromWorkspace(uris: URI[]): Promise<void> {
        const roots = new Set(this.workspaceService.tryGetRoots().map(root => root.resource.toString()));
        const toRemove = uris.filter(uri => roots.has(uri.toString()));
        if (toRemove.length > 0) {
            const messageContainer = document.createElement('div');
            if (toRemove.length > 1) {
                messageContainer.textContent = nls.localize('theia/workspace/removeFolders',
                    'Are you sure you want to remove the following folders from the workspace?');
            } else {
                messageContainer.textContent = nls.localize('theia/workspace/removeFolder',
                    'Are you sure you want to remove the following folder from the workspace?');
            }
            messageContainer.title = nls.localize('theia/workspace/noErasure', 'Note: Nothing will be erased from disk');
            const list = document.createElement('div');
            list.classList.add('theia-dialog-node');
            toRemove.forEach(uri => {
                const listItem = document.createElement('div');
                listItem.classList.add('theia-dialog-node-content');
                const folderIcon = document.createElement('span');
                folderIcon.classList.add('codicon', 'codicon-root-folder', 'theia-dialog-icon');
                listItem.appendChild(folderIcon);
                listItem.title = this.labelProvider.getLongName(uri);
                const listContent = document.createElement('span');
                listContent.classList.add('theia-dialog-node-segment');
                listContent.appendChild(document.createTextNode(this.labelProvider.getName(uri)));
                listItem.appendChild(listContent);
                list.appendChild(listItem);
            });
            messageContainer.appendChild(list);
            const dialog = new ConfirmDialog({
                title: nls.localizeByDefault('Remove Folder from Workspace'),
                msg: messageContainer
            });
            if (await dialog.open()) {
                await this.workspaceService.removeRoots(toRemove);
            }
        }
    }

    async saveWorkspaceWithPrompt(registry: CommandRegistry): Promise<void> {
        const saveCommand = registry.getCommand(WorkspaceCommands.SAVE_WORKSPACE_AS.id);
        if (saveCommand && await new ConfirmDialog({
            title: nls.localize('theia/workspace/workspaceFolderAddedTitle', 'Folder added to Workspace'),
            msg: nls.localize('theia/workspace/workspaceFolderAdded',
                'A workspace with multiple roots was created. Do you want to save your workspace configuration as a file?'),
            ok: Dialog.YES,
            cancel: Dialog.NO
        }).open()) {
            return registry.executeCommand(saveCommand.id);
        }
    }
}

export class WorkspaceRootUriAwareCommandHandler extends UriAwareCommandHandler<URI> {

    constructor(
        protected readonly workspaceService: WorkspaceService,
        selectionService: SelectionService,
        handler: UriCommandHandler<URI>
    ) {
        super(selectionService, handler);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public override isEnabled(...args: any[]): boolean {
        return super.isEnabled(...args) && !!this.workspaceService.tryGetRoots().length;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public override isVisible(...args: any[]): boolean {
        return super.isVisible(...args) && !!this.workspaceService.tryGetRoots().length;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected override getUri(...args: any[]): URI | undefined {
        const uri = super.getUri(...args);
        // Return the `uri` immediately if the resource exists in any of the workspace roots.
        if (uri && this.workspaceService.getWorkspaceRootUri(uri)) {
            return uri;
        }
        // Return the first root if available.
        if (!!this.workspaceService.tryGetRoots().length) {
            return this.workspaceService.tryGetRoots()[0].resource;
        }
    }

}
