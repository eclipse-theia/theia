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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MessageService, isWindows, MaybeArray } from '@theia/core/lib/common';
import { isOSX, environment, OS } from '@theia/core';
import {
    open, OpenerService, CommonMenus, KeybindingRegistry, KeybindingContribution,
    FrontendApplicationContribution, SHELL_TABBAR_CONTEXT_COPY, OnWillStopAction, Navigatable, SaveableSource, Widget
} from '@theia/core/lib/browser';
import { FileDialogService, OpenFileDialogProps, FileDialogTreeFilters } from '@theia/filesystem/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { WorkspaceService } from './workspace-service';
import { THEIA_EXT, VSCODE_EXT } from '../common';
import { WorkspaceCommands } from './workspace-commands';
import { QuickOpenWorkspace } from './quick-open-workspace';
import { WorkspacePreferences } from './workspace-preferences';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { EncodingRegistry } from '@theia/core/lib/browser/encoding-registry';
import { UTF8 } from '@theia/core/lib/common/encodings';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { nls } from '@theia/core/lib/common/nls';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { UntitledWorkspaceExitDialog } from './untitled-workspace-exit-dialog';
import { FilesystemSaveResourceService } from '@theia/filesystem/lib/browser/filesystem-save-resource-service';
import { StopReason } from '@theia/core/lib/common/frontend-application-state';

export enum WorkspaceStates {
    /**
     * The state is `empty` when no workspace is opened.
     */
    empty = 'empty',
    /**
     * The state is `workspace` when a workspace is opened.
     */
    workspace = 'workspace',
    /**
     * The state is `folder` when a folder is opened. (1 folder)
     */
    folder = 'folder',
};
export type WorkspaceState = keyof typeof WorkspaceStates;
export type WorkbenchState = keyof typeof WorkspaceStates;

/** Create the workspace section after open {@link CommonMenus.FILE_OPEN}. */
export const FILE_WORKSPACE = [...CommonMenus.FILE, '2_workspace'];

@injectable()
export class WorkspaceFrontendContribution implements CommandContribution, KeybindingContribution, MenuContribution, FrontendApplicationContribution {

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(QuickOpenWorkspace) protected readonly quickOpenWorkspace: QuickOpenWorkspace;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(WorkspacePreferences) protected preferences: WorkspacePreferences;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;
    @inject(EncodingRegistry) protected readonly encodingRegistry: EncodingRegistry;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigurations: PreferenceConfigurations;
    @inject(FilesystemSaveResourceService) protected readonly saveService: FilesystemSaveResourceService;

    configure(): void {
        this.encodingRegistry.registerOverride({ encoding: UTF8, extension: THEIA_EXT });
        this.encodingRegistry.registerOverride({ encoding: UTF8, extension: VSCODE_EXT });
        this.updateEncodingOverrides();

        const workspaceFolderCountKey = this.contextKeyService.createKey<number>('workspaceFolderCount', 0);
        const updateWorkspaceFolderCountKey = () => workspaceFolderCountKey.set(this.workspaceService.tryGetRoots().length);
        updateWorkspaceFolderCountKey();

        const workspaceStateKey = this.contextKeyService.createKey<WorkspaceState>('workspaceState', 'empty');
        const updateWorkspaceStateKey = () => workspaceStateKey.set(this.updateWorkspaceStateKey());
        updateWorkspaceStateKey();

        const workbenchStateKey = this.contextKeyService.createKey<WorkbenchState>('workbenchState', 'empty');
        const updateWorkbenchStateKey = () => workbenchStateKey.set(this.updateWorkbenchStateKey());
        updateWorkbenchStateKey();

        this.updateStyles();
        this.workspaceService.onWorkspaceChanged(() => {
            this.updateEncodingOverrides();
            updateWorkspaceFolderCountKey();
            updateWorkspaceStateKey();
            updateWorkbenchStateKey();
            this.updateStyles();
        });
    }

    protected readonly toDisposeOnUpdateEncodingOverrides = new DisposableCollection();
    protected updateEncodingOverrides(): void {
        this.toDisposeOnUpdateEncodingOverrides.dispose();
        for (const root of this.workspaceService.tryGetRoots()) {
            for (const configPath of this.preferenceConfigurations.getPaths()) {
                const parent = root.resource.resolve(configPath);
                this.toDisposeOnUpdateEncodingOverrides.push(this.encodingRegistry.registerOverride({ encoding: UTF8, parent }));
            }
        }
    }

    protected updateStyles(): void {
        document.body.classList.remove('theia-no-open-workspace');
        // Display the 'no workspace opened' theme color when no folders are opened (single-root).
        if (!this.workspaceService.isMultiRootWorkspaceOpened &&
            !this.workspaceService.tryGetRoots().length) {
            document.body.classList.add('theia-no-open-workspace');
        }
    }

    registerCommands(commands: CommandRegistry): void {
        // Not visible/enabled on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN, {
            isEnabled: () => isOSX || !this.isElectron(),
            isVisible: () => isOSX || !this.isElectron(),
            execute: () => this.doOpen()
        });
        // Visible/enabled only on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN_FILE, {
            isEnabled: () => true,
            execute: () => this.doOpenFile()
        });
        // Visible/enabled only on Windows/Linux in electron.
        commands.registerCommand(WorkspaceCommands.OPEN_FOLDER, {
            isEnabled: () => true,
            execute: () => this.doOpenFolder()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_WORKSPACE, {
            isEnabled: () => true,
            execute: () => this.doOpenWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.CLOSE, {
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.closeWorkspace()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE, {
            execute: () => this.quickOpenWorkspace.select()
        });
        commands.registerCommand(WorkspaceCommands.SAVE_WORKSPACE_AS, {
            isVisible: () => this.workspaceService.opened,
            isEnabled: () => this.workspaceService.opened,
            execute: () => this.saveWorkspaceAs()
        });
        commands.registerCommand(WorkspaceCommands.OPEN_WORKSPACE_FILE, {
            isEnabled: () => this.workspaceService.saved,
            execute: () => {
                if (this.workspaceService.saved && this.workspaceService.workspace) {
                    open(this.openerService, this.workspaceService.workspace.resource);
                }
            }

        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        if (isOSX || !this.isElectron()) {
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN.id,
                order: 'a00'
            });
        }
        if (!isOSX && this.isElectron()) {
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN_FILE.id,
                label: `${WorkspaceCommands.OPEN_FILE.dialogLabel}...`,
                order: 'a01'
            });
            menus.registerMenuAction(CommonMenus.FILE_OPEN, {
                commandId: WorkspaceCommands.OPEN_FOLDER.id,
                label: `${WorkspaceCommands.OPEN_FOLDER.dialogLabel}...`,
                order: 'a02'
            });
        }
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_WORKSPACE.id,
            order: 'a10'
        });
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            order: 'a20'
        });

        menus.registerMenuAction(FILE_WORKSPACE, {
            commandId: WorkspaceCommands.ADD_FOLDER.id,
            order: 'a10'
        });
        menus.registerMenuAction(FILE_WORKSPACE, {
            commandId: WorkspaceCommands.SAVE_WORKSPACE_AS.id,
            order: 'a20'
        });

        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: WorkspaceCommands.CLOSE.id
        });

        menus.registerMenuAction(CommonMenus.FILE_SAVE, {
            commandId: WorkspaceCommands.SAVE_AS.id,
        });

        menus.registerMenuAction(SHELL_TABBAR_CONTEXT_COPY, {
            commandId: WorkspaceCommands.COPY_RELATIVE_FILE_PATH.id,
            label: WorkspaceCommands.COPY_RELATIVE_FILE_PATH.label,
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: isOSX || !this.isElectron() ? WorkspaceCommands.OPEN.id : WorkspaceCommands.OPEN_FILE.id,
            keybinding: this.isElectron() ? 'ctrlcmd+o' : 'ctrlcmd+alt+o',
        });
        if (!isOSX && this.isElectron()) {
            keybindings.registerKeybinding({
                command: WorkspaceCommands.OPEN_FOLDER.id,
                keybinding: 'ctrl+k ctrl+o',
            });
        }
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+w',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.OPEN_RECENT_WORKSPACE.id,
            keybinding: 'ctrlcmd+alt+r',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.SAVE_AS.id,
            keybinding: 'ctrlcmd+shift+s',
        });
        keybindings.registerKeybinding({
            command: WorkspaceCommands.COPY_RELATIVE_FILE_PATH.id,
            keybinding: isWindows ? 'ctrl+k ctrl+shift+c' : 'ctrlcmd+shift+alt+c',
            when: '!editorFocus'
        });
    }

    /**
     * This is the generic `Open` method. Opens files and directories too. Resolves to the opened URI.
     * Except when you are on either Windows or Linux `AND` running in electron. If so, it opens a file.
     */
    protected async doOpen(): Promise<URI | undefined> {
        if (!isOSX && this.isElectron()) {
            return this.doOpenFile();
        }
        const [rootStat] = await this.workspaceService.roots;
        const destinationUri = await this.fileDialogService.showOpenDialog({
            title: WorkspaceCommands.OPEN.dialogLabel,
            canSelectFolders: true,
            canSelectFiles: true
        }, rootStat);
        if (destinationUri && this.getCurrentWorkspaceUri()?.toString() !== destinationUri.toString()) {
            const destination = await this.fileService.resolve(destinationUri);
            if (destination.isDirectory) {
                this.workspaceService.open(destinationUri);
            } else {
                await open(this.openerService, destinationUri);
            }
            return destinationUri;
        }
        return undefined;
    }

    /**
     * Opens a file after prompting the `Open File` dialog. Resolves to `undefined`, if
     *  - the workspace root is not set,
     *  - the file to open does not exist, or
     *  - it was not a file, but a directory.
     *
     * Otherwise, resolves to the URI of the file.
     */
    protected async doOpenFile(): Promise<URI | undefined> {
        const props: OpenFileDialogProps = {
            title: WorkspaceCommands.OPEN_FILE.dialogLabel,
            canSelectFolders: false,
            canSelectFiles: true
        };
        const [rootStat] = await this.workspaceService.roots;
        const destinationFileUri = await this.fileDialogService.showOpenDialog(props, rootStat);
        if (destinationFileUri) {
            const destinationFile = await this.fileService.resolve(destinationFileUri);
            if (!destinationFile.isDirectory) {
                await open(this.openerService, destinationFileUri);
                return destinationFileUri;
            }
        }
        return undefined;
    }

    /**
     * Opens one or more folders after prompting the `Open Folder` dialog. Resolves to `undefined`, if
     *  - the user's selection is empty or contains only files.
     *  - the new workspace is equal to the old workspace.
     *
     * Otherwise, resolves to the URI of the new workspace:
     *  - a single folder if a single folder was selected.
     *  - a new, untitled workspace file if multiple folders were selected.
     */
    protected async doOpenFolder(): Promise<URI | undefined> {
        const props: OpenFileDialogProps = {
            title: WorkspaceCommands.OPEN_FOLDER.dialogLabel,
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: true,
        };
        const [rootStat] = await this.workspaceService.roots;
        const targetFolders = await this.fileDialogService.showOpenDialog(props, rootStat);
        if (targetFolders) {
            const openableURI = await this.getOpenableWorkspaceUri(targetFolders);
            if (openableURI) {
                if (!this.workspaceService.workspace || !openableURI.isEqual(this.workspaceService.workspace.resource)) {
                    this.workspaceService.open(openableURI);
                    return openableURI;
                }
            };
        }
        return undefined;
    }

    protected async getOpenableWorkspaceUri(uris: MaybeArray<URI>): Promise<URI | undefined> {
        if (Array.isArray(uris)) {
            if (uris.length < 2) {
                return uris[0];
            } else {
                const foldersToOpen = (await Promise.all(uris.map(uri => this.fileService.resolve(uri))))
                    .filter(fileStat => !!fileStat?.isDirectory);
                if (foldersToOpen.length === 1) {
                    return foldersToOpen[0].resource;
                } else {
                    return this.createMultiRootWorkspace(foldersToOpen);
                }
            }
        } else {
            return uris;
        }
    }

    protected async createMultiRootWorkspace(roots: FileStat[]): Promise<URI> {
        const untitledWorkspace = await this.workspaceService.getUntitledWorkspace();
        const folders = Array.from(new Set(roots.map(stat => stat.resource.path.toString())), path => ({ path }));
        const workspaceStat = await this.fileService.createFile(
            untitledWorkspace,
            BinaryBuffer.fromString(JSON.stringify({ folders }, null, 4)), // eslint-disable-line no-null/no-null
            { overwrite: true }
        );
        return workspaceStat.resource;
    }

    /**
     * Opens a workspace after raising the `Open Workspace` dialog. Resolves to the URI of the recently opened workspace,
     * if it was successful. Otherwise, resolves to `undefined`.
     *
     * **Caveat**: this behaves differently on different platforms
     * and `electron`/`browser` version has impact too. See [here](https://github.com/eclipse-theia/theia/pull/3202#issuecomment-430884195) for more details.
     *
     * Legend:
     *  - Folders only: => `F`
     *  - Workspace files only: => `W`
     *  - Folders and workspace files: => `FW`
     *
     * -----
     *
     * |---------|-----------|-----------|------------|------------|
     * |         | browser Y | browser N | electron Y | electron N |
     * |---------|-----------|-----------|------------|------------|
     * | Linux   |     FW    |     F     |     W      |     F      |
     * | Windows |     FW    |     F     |     W      |     F      |
     * | OS X    |     FW    |     F     |     FW     |     FW     |
     * |---------|-----------|-----------|------------|------------|
     *
     */
    protected async doOpenWorkspace(): Promise<URI | undefined> {
        const props = await this.openWorkspaceOpenFileDialogProps();
        const [rootStat] = await this.workspaceService.roots;
        const workspaceFolderOrWorkspaceFileUri = await this.fileDialogService.showOpenDialog(props, rootStat);
        if (workspaceFolderOrWorkspaceFileUri &&
            this.getCurrentWorkspaceUri()?.toString() !== workspaceFolderOrWorkspaceFileUri.toString()) {
            const destinationFolder = await this.fileService.exists(workspaceFolderOrWorkspaceFileUri);
            if (destinationFolder) {
                this.workspaceService.open(workspaceFolderOrWorkspaceFileUri);
                return workspaceFolderOrWorkspaceFileUri;
            }
        }
        return undefined;
    }

    protected async openWorkspaceOpenFileDialogProps(): Promise<OpenFileDialogProps> {
        await this.preferences.ready;
        const type = OS.type();
        const electron = this.isElectron();
        return WorkspaceFrontendContribution.createOpenWorkspaceOpenFileDialogProps({
            type,
            electron,
        });
    }

    protected async closeWorkspace(): Promise<void> {
        await this.workspaceService.close();
    }

    /**
     * @returns whether the file was successfully saved.
     */
    protected async saveWorkspaceAs(): Promise<boolean> {
        let exist: boolean = false;
        let overwrite: boolean = false;
        let selected: URI | undefined;
        do {
            selected = await this.fileDialogService.showSaveDialog({
                title: WorkspaceCommands.SAVE_WORKSPACE_AS.label!,
                filters: WorkspaceFrontendContribution.DEFAULT_FILE_FILTER
            });
            if (selected) {
                const displayName = selected.displayName;
                if (!displayName.endsWith(`.${THEIA_EXT}`) && !displayName.endsWith(`.${VSCODE_EXT}`)) {
                    selected = selected.parent.resolve(`${displayName}.${THEIA_EXT}`);
                }
                exist = await this.fileService.exists(selected);
                if (exist) {
                    overwrite = await this.saveService.confirmOverwrite(selected);
                }
            }
        } while (selected && exist && !overwrite);

        if (selected) {
            try {
                await this.workspaceService.save(selected);
                return true;
            } catch {
                this.messageService.error(nls.localizeByDefault("Unable to save workspace '{0}'", selected.path.fsPath()));
            }
        }
        return false;
    }

    canBeSavedAs(widget: Widget | undefined): widget is Widget & SaveableSource & Navigatable {
        return this.saveService.canSaveAs(widget);
    }

    async saveAs(widget: Widget & SaveableSource & Navigatable): Promise<void> {
        return this.saveService.saveAs(widget);
    }

    protected updateWorkspaceStateKey(): WorkspaceState {
        return this.doUpdateState();
    }

    protected updateWorkbenchStateKey(): WorkbenchState {
        return this.doUpdateState();
    }

    protected doUpdateState(): WorkspaceState | WorkbenchState {
        if (this.workspaceService.opened) {
            return this.workspaceService.isMultiRootWorkspaceOpened ? 'workspace' : 'folder';
        }
        return 'empty';
    }

    private isElectron(): boolean {
        return environment.electron.is();
    }

    /**
     * Get the current workspace URI.
     *
     * @returns the current workspace URI.
     */
    private getCurrentWorkspaceUri(): URI | undefined {
        return this.workspaceService.workspace?.resource;
    }

    onWillStop(): OnWillStopAction<boolean> | undefined {
        const { workspace } = this.workspaceService;
        if (workspace && this.workspaceService.isUntitledWorkspace(workspace.resource)) {
            return {
                prepare: async reason => reason === StopReason.Reload && this.workspaceService.isSafeToReload(workspace.resource),
                action: async alreadyConfirmedSafe => {
                    if (alreadyConfirmedSafe) {
                        return true;
                    }
                    const shouldSaveFile = await new UntitledWorkspaceExitDialog({
                        title: nls.localizeByDefault('Do you want to save your workspace configuration as a file?')
                    }).open();
                    if (shouldSaveFile === "Don't Save") {
                        return true;
                    } else if (shouldSaveFile === 'Save') {
                        return this.saveWorkspaceAs();
                    }
                    return false; // If cancel, prevent exit.

                },
                reason: 'Untitled workspace.',
                // Since deleting the workspace would hobble any future functionality, run this late.
                priority: 100,
            };
        }
    }
}

export namespace WorkspaceFrontendContribution {

    /**
     * File filter for all Theia and VS Code workspace file types.
     */
    export const DEFAULT_FILE_FILTER: FileDialogTreeFilters = {
        'Theia Workspace (*.theia-workspace)': [THEIA_EXT],
        'VS Code Workspace (*.code-workspace)': [VSCODE_EXT]
    };

    /**
     * Returns with an `OpenFileDialogProps` for opening the `Open Workspace` dialog.
     */
    export function createOpenWorkspaceOpenFileDialogProps(options: Readonly<{ type: OS.Type, electron: boolean }>): OpenFileDialogProps {
        const { electron, type } = options;
        const title = WorkspaceCommands.OPEN_WORKSPACE.dialogLabel;
        // If browser
        if (!electron) {
            return {
                title,
                canSelectFiles: true,
                canSelectFolders: true,
                filters: DEFAULT_FILE_FILTER
            };
        }

        // If electron
        if (OS.Type.OSX === type) {
            // `Finder` can select folders and files at the same time. We allow folders and workspace files.
            return {
                title,
                canSelectFiles: true,
                canSelectFolders: true,
                filters: DEFAULT_FILE_FILTER
            };
        }

        return {
            title,
            canSelectFiles: true,
            canSelectFolders: false,
            filters: DEFAULT_FILE_FILTER
        };
    }

}
