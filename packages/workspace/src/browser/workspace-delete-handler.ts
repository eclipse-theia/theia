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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ConfirmDialog, ApplicationShell, Navigatable, SaveableWidget, Saveable, Widget } from '@theia/core/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser';
import { UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';

@injectable()
export class WorkspaceDeleteHandler implements UriCommandHandler<URI[]> {

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    @postConstruct()
    protected init(): void {
        this.fileSystemWatcher.onFilesChanged(event => this.updateWidgets(event));
    }

    isVisible(uris: URI[]): boolean {
        const rootUris = this.workspaceService.tryGetRoots().map(root => new URI(root.uri));
        return !rootUris.some(rootUri => uris.some(uri => uri.isEqualOrParent(rootUri)));
    }

    async execute(uris: URI[]): Promise<void> {
        const distinctUris = URI.getDistinctParents(uris);
        if (await this.confirm(distinctUris)) {
            await Promise.all(distinctUris.map(uri => this.delete(uri)));
        }
    }

    protected confirm(uris: URI[]): Promise<boolean | undefined> {
        return new ConfirmDialog({
            title: `Delete File${uris.length === 1 ? '' : 's'}`,
            msg: this.getConfirmMessage(uris)
        }).open();
    }

    protected getConfirmMessage(uris: URI[]): string | HTMLElement {
        const dirty = this.getDirty(uris);
        if (dirty.length) {
            if (dirty.length === 1) {
                return `Do you really want to delete ${dirty[0].path.base} with unsaved changes?`;
            }
            return `Do you really want to delete ${dirty.length} files with unsaved changes?`;
        }
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
    }

    protected getDirty(uris: URI[]): URI[] {
        const dirty = new Map<string, URI>();
        for (const widget of this.shell.widgets) {
            if (Saveable.isDirty(widget) && Navigatable.is(widget)) {
                const targetUri = widget.getTargetUri();
                if (targetUri) {
                    const key = targetUri.toString();
                    if (!dirty.has(key) && uris.some(uri => uri.isEqualOrParent(targetUri))) {
                        dirty.set(key, targetUri);
                    }
                }
            }
        }
        return [...dirty.values()];
    }

    protected async delete(uri: URI): Promise<void> {
        try {
            this.closeWithoutSaving(uri);
            await this.fileSystem.delete(uri.toString());
        } catch (e) {
            console.error(e);
        }
    }

    protected async closeWithoutSaving(uri: URI): Promise<void> {
        for (const widget of this.getAffectedWidgets(uri)) {
            if (SaveableWidget.is(widget)) {
                widget.closeWithoutSaving();
            } else {
                widget.close();
            }
        }
    }

    protected *getAffectedWidgets(uri: URI): IterableIterator<Widget> {
        for (const widget of this.shell.widgets) {
            if (Navigatable.is(widget)) {
                const targetUri = widget.getTargetUri();
                if (targetUri && uri.isEqualOrParent(targetUri)) {
                    yield widget;
                }
            }
        }
    }

    protected updateWidgets(event: FileChangeEvent): void {
        const dirty = new Set<string>();
        const toClose = new Map<string, Widget[]>();
        for (const widget of this.shell.widgets) {
            this.updateWidget(widget, event, { dirty, toClose });
        }
        for (const [uriString, widgets] of toClose.entries()) {
            if (!dirty.has(uriString)) {
                for (const widget of widgets) {
                    widget.close();
                }
            }
        }
    }

    protected readonly deletedSuffix = ' (deleted from disk)';
    protected updateWidget(widget: Widget, event: FileChangeEvent, { dirty, toClose }: {
        dirty: Set<string>;
        toClose: Map<string, Widget[]>
    }) {
        if (!Navigatable.is(widget)) {
            return;
        }
        const targetUri = widget.getTargetUri();
        if (!targetUri) {
            return;
        }
        const label = widget.title.label;
        const deleted = label.endsWith(this.deletedSuffix);
        if (FileChangeEvent.isDeleted(event, targetUri)) {
            const uriString = targetUri.toString();
            if (Saveable.isDirty(widget)) {
                if (!deleted) {
                    widget.title.label += this.deletedSuffix;
                }
                dirty.add(uriString);
            }
            const widgets = toClose.get(uriString) || [];
            widgets.push(widget);
            toClose.set(uriString, widgets);
        } else if (FileChangeEvent.isAdded(event, targetUri)) {
            if (deleted) {
                widget.title.label = widget.title.label.substr(0, label.length - this.deletedSuffix.length);
            }
        }
    }

}
