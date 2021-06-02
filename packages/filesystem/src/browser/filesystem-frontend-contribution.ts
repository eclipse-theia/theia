/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { MaybePromise, SelectionService, isCancelled } from '@theia/core/lib/common';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import {
    FrontendApplicationContribution, ApplicationShell,
    NavigatableWidget, NavigatableWidgetOptions,
    Saveable, WidgetManager, StatefulWidget, FrontendApplication, ExpandableTreeNode, waitForClosed,
    CorePreferences
} from '@theia/core/lib/browser';
import { MimeService } from '@theia/core/lib/browser/mime-service';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { FileSystemPreferences } from './filesystem-preferences';
import { FileSelection } from './file-selection';
import { FileUploadService, FileUploadResult } from './file-upload-service';
import { FileService, UserFileOperationEvent } from './file-service';
import { FileChangesEvent, FileChangeType, FileOperation } from '../common/files';
import { Deferred } from '@theia/core/lib/common/promise-util';

export namespace FileSystemCommands {

    export const UPLOAD: Command = {
        id: 'file.upload',
        category: 'File',
        label: 'Upload Files...'
    };

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
        commands.registerCommand(FileSystemCommands.UPLOAD, new FileSelection.CommandHandler(this.selectionService, {
            multi: false,
            isEnabled: selection => this.canUpload(selection),
            isVisible: selection => this.canUpload(selection),
            execute: selection => this.upload(selection)
        }));
    }

    protected canUpload({ fileStat }: FileSelection): boolean {
        return !environment.electron.is() && fileStat.isDirectory;
    }

    protected async upload(selection: FileSelection): Promise<FileUploadResult | undefined> {
        try {
            const source = TreeWidgetSelection.getSource(this.selectionService.selection);
            const fileUploadResult = await this.uploadService.upload(selection.fileStat.resource);
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

    protected readonly deletedSuffix = ' (deleted)';
    protected async updateWidgets(event: FileChangesEvent): Promise<void> {
        if (!event.gotDeleted() && !event.gotAdded()) {
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pending: Promise<any>[] = [];

        const dirty = new Set<string>();
        const toClose = new Map<string, NavigatableWidget[]>();
        for (const [uri, widget] of NavigatableWidget.get(this.shell.widgets)) {
            this.updateWidget(uri, widget, event, { dirty, toClose });
        }
        for (const [uriString, widgets] of toClose.entries()) {
            if (!dirty.has(uriString) && this.corePreferences['workbench.editor.closeOnFileDelete']) {
                for (const widget of widgets) {
                    widget.close();
                    pending.push(waitForClosed(widget));
                }
            }
        }

        await Promise.all(pending);
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
            }
            const widgets = toClose.get(uriString) || [];
            widgets.push(widget);
            toClose.set(uriString, widgets);
        } else if (event.contains(uri, FileChangeType.ADDED)) {
            if (deleted) {
                widget.title.label = widget.title.label.substr(0, label.length - this.deletedSuffix.length);
            }
        }
    }

    protected updateAssociations(): void {
        const fileAssociations = this.preferences['files.associations'];
        const mimeAssociations = Object.keys(fileAssociations).map(filepattern => ({ id: fileAssociations[filepattern], filepattern }));
        this.mimeService.setAssociations(mimeAssociations);
    }
}
