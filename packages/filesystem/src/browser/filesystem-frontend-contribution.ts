// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { nls } from '@theia/core';
import {
    ApplicationShell,
    CommonCommands,
    CorePreferences,
    ExpandableTreeNode,
    FrontendApplication,
    FrontendApplicationContribution,
    NavigatableWidget, NavigatableWidgetOptions,
    OpenerService,
    Saveable,
    StatefulWidget,
    WidgetManager,
    open
} from '@theia/core/lib/browser';
import { MimeService } from '@theia/core/lib/browser/mime-service';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { Emitter, MaybePromise, SelectionService, isCancelled } from '@theia/core/lib/common';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { Deferred } from '@theia/core/lib/common/promise-util';
import URI from '@theia/core/lib/common/uri';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { inject, injectable } from '@theia/core/shared/inversify';
import { UserWorkingDirectoryProvider } from '@theia/core/lib/browser/user-working-directory-provider';
import { FileChangeType, FileChangesEvent, FileOperation } from '../common/files';
import { FileDialogService, SaveFileDialogProps } from './file-dialog';
import { FileSelection } from './file-selection';
import { FileService, UserFileOperationEvent } from './file-service';
import { FileUploadResult, FileUploadService } from './file-upload-service';
import { FileSystemPreferences } from './filesystem-preferences';

export namespace FileSystemCommands {

    export const UPLOAD = Command.toLocalizedCommand({
        id: 'file.upload',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Upload Files...'
    }, 'theia/filesystem/uploadFiles', CommonCommands.FILE_CATEGORY_KEY);

}

export interface NavigatableWidgetMoveSnapshot {
    dirty?: object,
    view?: object
}

@injectable()
export class FileSystemFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(MimeService)
    protected readonly mimeService: MimeService;

    @inject(FileSystemPreferences)
    protected readonly preferences: FileSystemPreferences;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(FileUploadService)
    protected readonly uploadService: FileUploadService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(FileDialogService)
    protected readonly fileDialogService: FileDialogService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(UserWorkingDirectoryProvider)
    protected readonly workingDirectory: UserWorkingDirectoryProvider;

    protected onDidChangeEditorFileEmitter = new Emitter<{ editor: NavigatableWidget, type: FileChangeType }>();
    readonly onDidChangeEditorFile = this.onDidChangeEditorFileEmitter.event;

    protected readonly userOperations = new Map<number, Deferred<void>>();
    protected queueUserOperation(event: UserFileOperationEvent): void {
        const moveOperation = new Deferred<void>();
        this.userOperations.set(event.correlationId, moveOperation);
        this.run(() => moveOperation.promise);
    }
    protected resolveUserOperation(event: UserFileOperationEvent): void {
        const operation = this.userOperations.get(event.correlationId);
        if (operation) {
            this.userOperations.delete(event.correlationId);
            operation.resolve();
        }
    }

    initialize(): void {
        this.fileService.onDidFilesChange(event => this.run(() => this.updateWidgets(event)));
        this.fileService.onWillRunUserOperation(event => {
            this.queueUserOperation(event);
            event.waitUntil(this.runEach((uri, widget) => this.pushMove(uri, widget, event)));
        });
        this.fileService.onDidFailUserOperation(event => event.waitUntil((async () => {
            await this.runEach((uri, widget) => this.revertMove(uri, widget, event));
            this.resolveUserOperation(event);
        })()));
        this.fileService.onDidRunUserOperation(event => event.waitUntil((async () => {
            await this.runEach((uri, widget) => this.applyMove(uri, widget, event));
            this.resolveUserOperation(event);
        })()));
        this.uploadService.onDidUpload(files => {
            this.doHandleUpload(files);
        });
    }

    onStart?(app: FrontendApplication): MaybePromise<void> {
        this.updateAssociations();
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'files.associations') {
                this.updateAssociations();
            }
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(FileSystemCommands.UPLOAD, {
            isEnabled: (...args: unknown[]) => {
                const selection = this.getSelection(...args);
                return !!selection && !environment.electron.is();
            },
            isVisible: () => !environment.electron.is(),
            execute: (...args: unknown[]) => {
                const selection = this.getSelection(...args);
                if (selection) {
                    return this.upload(selection);
                }
            }
        });
        commands.registerCommand(CommonCommands.NEW_FILE, {
            execute: (...args: unknown[]) => {
                this.handleNewFileCommand(args);
            }
        });
    }

    protected async upload(selection: FileSelection): Promise<FileUploadResult | undefined> {
        try {
            const source = TreeWidgetSelection.getSource(this.selectionService.selection);
            const fileUploadResult = await this.uploadService.upload(selection.fileStat.isDirectory ? selection.fileStat.resource : selection.fileStat.resource.parent);
            if (ExpandableTreeNode.is(selection) && source) {
                await source.model.expandNode(selection);
            }
            return fileUploadResult;
        } catch (e) {
            if (!isCancelled(e)) {
                console.error(e);
            }
        }
    }

    protected async doHandleUpload(uploads: string[]): Promise<void> {
        // Only handle single file uploads
        if (uploads.length === 1) {
            const uri = new URI(uploads[0]);
            // Close all existing widgets for this URI
            const widgets = this.shell.widgets.filter(widget => NavigatableWidget.getUri(widget)?.isEqual(uri));
            await this.shell.closeMany(widgets, {
                // Don't ask to save the file if it's dirty
                // The user has already confirmed the file overwrite
                save: false
            });
            // Open a new editor for this URI
            open(this.openerService, uri);
        }
    }

    /**
     * Opens a save dialog to create a new file.
     *
     * @param args The first argument is the name of the new file. The second argument is the parent directory URI.
     */
    protected async handleNewFileCommand(args: unknown[]): Promise<void> {
        const fileName = (args !== undefined && typeof args[0] === 'string') ? args[0] : undefined;
        const title = nls.localizeByDefault('Create File');
        const props: SaveFileDialogProps = { title, saveLabel: title, inputValue: fileName };

        const dirUri = (args[1] instanceof URI) ? args[1] : await this.workingDirectory.getUserWorkingDir();
        const directory = await this.fileService.resolve(dirUri);

        const filePath = await this.fileDialogService.showSaveDialog(props, directory.isDirectory ? directory : undefined);
        if (filePath) {
            const file = await this.fileService.createFile(filePath);
            open(this.openerService, file.resource);
        }
    }

    protected getSelection(...args: unknown[]): FileSelection | undefined {
        const { selection } = this.selectionService;
        return this.toSelection(args[0]) ?? (Array.isArray(selection) ? selection.find(FileSelection.is) : this.toSelection(selection));
    };

    protected toSelection(arg: unknown): FileSelection | undefined {
        return FileSelection.is(arg) ? arg : undefined;
    }

    protected pendingOperation = Promise.resolve();
    protected run(operation: () => MaybePromise<void>): Promise<void> {
        return this.pendingOperation = this.pendingOperation.then(async () => {
            try {
                await operation();
            } catch (e) {
                console.error(e);
            }
        });
    }

    protected async runEach(participant: (resourceUri: URI, widget: NavigatableWidget) => Promise<void>): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const [resourceUri, widget] of NavigatableWidget.get(this.shell.widgets)) {
            promises.push(participant(resourceUri, widget));
        }
        await Promise.all(promises);
    }

    protected readonly moveSnapshots = new Map<string, NavigatableWidgetMoveSnapshot>();

    protected popMoveSnapshot(resourceUri: URI): NavigatableWidgetMoveSnapshot | undefined {
        const snapshotKey = resourceUri.toString();
        const snapshot = this.moveSnapshots.get(snapshotKey);
        if (snapshot) {
            this.moveSnapshots.delete(snapshotKey);
        }
        return snapshot;
    }

    protected applyMoveSnapshot(widget: NavigatableWidget, snapshot: NavigatableWidgetMoveSnapshot | undefined): void {
        if (!snapshot) {
            return undefined;
        }
        if (snapshot.dirty) {
            const saveable = Saveable.get(widget);
            if (saveable && saveable.applySnapshot) {
                saveable.applySnapshot(snapshot.dirty);
            }
        }
        if (snapshot.view && StatefulWidget.is(widget)) {
            widget.restoreState(snapshot.view);
        }
    }

    protected async pushMove(resourceUri: URI, widget: NavigatableWidget, event: UserFileOperationEvent): Promise<void> {
        const newResourceUri = this.createMoveToUri(resourceUri, widget, event);
        if (!newResourceUri) {
            return;
        }
        const snapshot: NavigatableWidgetMoveSnapshot = {};
        const saveable = Saveable.get(widget);
        if (StatefulWidget.is(widget)) {
            snapshot.view = widget.storeState();
        }
        if (saveable && saveable.dirty) {
            if (saveable.createSnapshot) {
                snapshot.dirty = saveable.createSnapshot();
            }
            if (saveable.revert) {
                await saveable.revert({ soft: true });
            }
        }
        this.moveSnapshots.set(newResourceUri.toString(), snapshot);
    }

    protected async revertMove(resourceUri: URI, widget: NavigatableWidget, event: UserFileOperationEvent): Promise<void> {
        const newResourceUri = this.createMoveToUri(resourceUri, widget, event);
        if (!newResourceUri) {
            return;
        }
        const snapshot = this.popMoveSnapshot(newResourceUri);
        this.applyMoveSnapshot(widget, snapshot);
    }

    protected async applyMove(resourceUri: URI, widget: NavigatableWidget, event: UserFileOperationEvent): Promise<void> {
        const newResourceUri = this.createMoveToUri(resourceUri, widget, event);
        if (!newResourceUri) {
            return;
        }

        const snapshot = this.popMoveSnapshot(newResourceUri);

        const description = this.widgetManager.getDescription(widget);
        if (!description) {
            return;
        }
        const { factoryId, options } = description;
        if (!NavigatableWidgetOptions.is(options)) {
            return;
        }

        const newWidget = await this.widgetManager.getOrCreateWidget<NavigatableWidget>(factoryId, <NavigatableWidgetOptions>{
            ...options,
            uri: newResourceUri.toString()
        });
        this.applyMoveSnapshot(newWidget, snapshot);
        const area = this.shell.getAreaFor(widget) || 'main';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pending: Promise<any>[] = [this.shell.addWidget(newWidget, {
            area, ref: widget
        })];
        if (this.shell.activeWidget === widget) {
            pending.push(this.shell.activateWidget(newWidget.id));
        } else if (widget.isVisible) {
            pending.push(this.shell.revealWidget(newWidget.id));
        }
        pending.push(this.shell.closeWidget(widget.id, { save: false }));
        await Promise.all(pending);
    }

    protected createMoveToUri(resourceUri: URI, widget: NavigatableWidget, event: UserFileOperationEvent): URI | undefined {
        if (event.operation !== FileOperation.MOVE) {
            return undefined;
        }
        const path = event.source?.relative(resourceUri);
        const targetUri = path && event.target.resolve(path);
        return targetUri && widget.createMoveToUri(targetUri);
    }

    protected readonly deletedSuffix = `(${nls.localizeByDefault('Deleted')})`;
    protected async updateWidgets(event: FileChangesEvent): Promise<void> {
        if (!event.gotDeleted() && !event.gotAdded()) {
            return;
        }
        const dirty = new Set<string>();
        const toClose = new Map<string, NavigatableWidget[]>();
        for (const [uri, widget] of NavigatableWidget.get(this.shell.widgets)) {
            this.updateWidget(uri, widget, event, { dirty, toClose: toClose });
        }
        if (this.corePreferences['workbench.editor.closeOnFileDelete']) {
            const doClose = [];
            for (const [uri, widgets] of toClose.entries()) {
                if (!dirty.has(uri)) {
                    doClose.push(...widgets);
                }
            }
            await this.shell.closeMany(doClose);
        }
    }
    protected updateWidget(uri: URI, widget: NavigatableWidget, event: FileChangesEvent, { dirty, toClose }: {
        dirty: Set<string>;
        toClose: Map<string, NavigatableWidget[]>
    }): void {
        const label = widget.title.label;
        const deleted = label.endsWith(this.deletedSuffix);
        if (event.contains(uri, FileChangeType.DELETED)) {
            const uriString = uri.toString();
            if (Saveable.isDirty(widget)) {
                dirty.add(uriString);
            }
            if (!deleted) {
                widget.title.label += this.deletedSuffix;
                this.onDidChangeEditorFileEmitter.fire({ editor: widget, type: FileChangeType.DELETED });
            }
            const widgets = toClose.get(uriString) || [];
            widgets.push(widget);
            toClose.set(uriString, widgets);
        } else if (event.contains(uri, FileChangeType.ADDED)) {
            if (deleted) {
                widget.title.label = widget.title.label.substring(0, label.length - this.deletedSuffix.length);
                this.onDidChangeEditorFileEmitter.fire({ editor: widget, type: FileChangeType.ADDED });
            }
        }
    }

    protected updateAssociations(): void {
        const fileAssociations = this.preferences['files.associations'];
        const mimeAssociations = Object.keys(fileAssociations).map(filepattern => ({ id: fileAssociations[filepattern], filepattern }));
        this.mimeService.setAssociations(mimeAssociations);
    }
}
