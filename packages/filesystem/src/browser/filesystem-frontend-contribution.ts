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

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { environment } from '@theia/application-package/lib/environment';
import { MaybePromise, SelectionService, isCancelled } from '@theia/core/lib/common';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import {
    FrontendApplicationContribution, ApplicationShell,
    NavigatableWidget, NavigatableWidgetOptions,
    Saveable, WidgetManager, StatefulWidget, FrontendApplication, ExpandableTreeNode
} from '@theia/core/lib/browser';
import { FileSystemWatcher, FileChangeEvent, FileMoveEvent, FileChangeType } from './filesystem-watcher';
import { MimeService } from '@theia/core/lib/browser/mime-service';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { FileSystemPreferences } from './filesystem-preferences';
import { FileSelection } from './file-selection';
import { FileUploadService } from './file-upload-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export namespace FileSystemCommands {

    export const UPLOAD: Command = {
        id: 'file.upload',
        category: 'File',
        label: 'Upload Files...'
    };

}

@injectable()
export class FileSystemFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    @inject(MimeService)
    protected readonly mimeService: MimeService;

    @inject(FileSystemPreferences)
    protected readonly preferences: FileSystemPreferences;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(FileUploadService)
    protected readonly uploadService: FileUploadService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    initialize(): void {
        this.fileSystemWatcher.onFilesChanged(event => this.run(() => this.updateWidgets(event)));
        this.fileSystemWatcher.onDidMove(event => this.run(() => this.moveWidgets(event)));
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
            isEnabled: selection => this.menuItemEnabled(selection),
            isVisible: selection => this.menuItemVisible(selection),
            execute: selection => this.upload(selection)
        }));
    }

    //the top-left corner menu should always be enabled
    protected menuItemEnabled(selection: FileSelection | undefined): boolean {
        selection;
        return !environment.electron.is();
    }

    //the right-click context menu should be invisible when the selected item is a regular file
    protected menuItemVisible(selection: FileSelection | undefined): boolean {
        //the only cases we can't upload are: electron environment, and fileSelection is a regular file
        return !environment.electron.is() && (selection == undefined || selection.fileStat.isDirectory);
    }

    protected async upload(selection: FileSelection): Promise<void> {
        try {
            //use workspace root if there is no selection
            if (selection == undefined) {
                await this.uploadService.upload(this.workspaceService.tryGetRoots()[0].uri);
                //if selection is a regular file, then upload to its parent folder
            } else if (!selection.fileStat.isDirectory) {
                await this.uploadService.upload((new URI(selection.fileStat.uri)).parent);
            } else {
                const source = TreeWidgetSelection.getSource(this.selectionService.selection);
                await this.uploadService.upload(selection.fileStat.uri);
                if (ExpandableTreeNode.is(selection) && source) {
                    await source.model.expandNode(selection);
                }
            }

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

    protected async moveWidgets(event: FileMoveEvent): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const [resourceUri, widget] of NavigatableWidget.get(this.shell.widgets)) {
            promises.push(this.moveWidget(resourceUri, widget, event));
        }
        await Promise.all(promises);
    }
    protected async moveWidget(resourceUri: URI, widget: NavigatableWidget, event: FileMoveEvent): Promise<void> {
        const newResourceUri = this.createMoveToUri(resourceUri, widget, event);
        if (!newResourceUri) {
            return;
        }
        const description = this.widgetManager.getDescription(widget);
        if (!description) {
            return;
        }
        const { factoryId, options } = description;
        if (!NavigatableWidgetOptions.is(options)) {
            return;
        }
        const newWidget = await this.widgetManager.getOrCreateWidget(factoryId, <NavigatableWidgetOptions>{
            ...options,
            uri: newResourceUri.toString()
        });
        const oldState = StatefulWidget.is(widget) ? widget.storeState() : undefined;
        if (oldState && StatefulWidget.is(newWidget)) {
            newWidget.restoreState(oldState);
        }
        const area = this.shell.getAreaFor(widget) || 'main';
        this.shell.addWidget(newWidget, {
            area, ref: widget
        });
        if (this.shell.activeWidget === widget) {
            this.shell.activateWidget(newWidget.id);
        } else if (widget.isVisible) {
            this.shell.revealWidget(newWidget.id);
        }
    }
    protected createMoveToUri(resourceUri: URI, widget: NavigatableWidget, event: FileMoveEvent): URI | undefined {
        const path = event.sourceUri.relative(resourceUri);
        const targetUri = path && event.targetUri.resolve(path);
        return targetUri && widget.createMoveToUri(targetUri);
    }

    protected readonly deletedSuffix = ' (deleted from disk)';
    protected updateWidgets(event: FileChangeEvent): void {
        const relevantEvent = event.filter(({ type }) => type !== FileChangeType.UPDATED);
        if (relevantEvent.length) {
            this.doUpdateWidgets(relevantEvent);
        }
    }
    protected doUpdateWidgets(event: FileChangeEvent): void {
        const dirty = new Set<string>();
        const toClose = new Map<string, NavigatableWidget[]>();
        for (const [uri, widget] of NavigatableWidget.get(this.shell.widgets)) {
            this.updateWidget(uri, widget, event, { dirty, toClose });
        }
        for (const [uriString, widgets] of toClose.entries()) {
            if (!dirty.has(uriString)) {
                for (const widget of widgets) {
                    widget.close();
                }
            }
        }
    }
    protected updateWidget(uri: URI, widget: NavigatableWidget, event: FileChangeEvent, { dirty, toClose }: {
        dirty: Set<string>;
        toClose: Map<string, NavigatableWidget[]>
    }) {
        const label = widget.title.label;
        const deleted = label.endsWith(this.deletedSuffix);
        if (FileChangeEvent.isDeleted(event, uri)) {
            const uriString = uri.toString();
            if (Saveable.isDirty(widget)) {
                if (!deleted) {
                    widget.title.label += this.deletedSuffix;
                }
                dirty.add(uriString);
            }
            const widgets = toClose.get(uriString) || [];
            widgets.push(widget);
            toClose.set(uriString, widgets);
        } else if (FileChangeEvent.isAdded(event, uri)) {
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
