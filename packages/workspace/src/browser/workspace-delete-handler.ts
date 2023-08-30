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

import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { ConfirmDialog, ApplicationShell, SaveableWidget, NavigatableWidget } from '@theia/core/lib/browser';
import { UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';
import { WorkspaceUtils } from './workspace-utils';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { FileDeleteOptions, FileSystemProviderCapabilities } from '@theia/filesystem/lib/common/files';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class WorkspaceDeleteHandler implements UriCommandHandler<URI[]> {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WorkspaceUtils)
    protected readonly workspaceUtils: WorkspaceUtils;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileSystemPreferences)
    protected readonly fsPreferences: FileSystemPreferences;

    /**
     * Determine if the command is visible.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is visible.
     */
    isVisible(uris: URI[]): boolean {
        return !!uris.length && !this.workspaceUtils.containsRootDirectory(uris);
    }

    /**
     * Determine if the command is enabled.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is enabled.
     */
    isEnabled(uris: URI[]): boolean {
        return !!uris.length && !this.workspaceUtils.containsRootDirectory(uris);
    }

    /**
     * Execute the command.
     *
     * @param uris URIs of selected resources.
     */
    async execute(uris: URI[]): Promise<void> {
        const distinctUris = URI.getDistinctParents(uris);
        const resolved: FileDeleteOptions = {
            recursive: true,
            useTrash: this.fsPreferences['files.enableTrash'] && distinctUris[0] && this.fileService.hasCapability(distinctUris[0], FileSystemProviderCapabilities.Trash)
        };
        if (await this.confirm(distinctUris, resolved)) {
            await Promise.all(distinctUris.map(uri => this.delete(uri, resolved)));
        }
    }

    /**
     * Display dialog to confirm deletion.
     *
     * @param uris URIs of selected resources.
     */
    protected confirm(uris: URI[], options: FileDeleteOptions): Promise<boolean | undefined> {
        let title = uris.length === 1 ? nls.localizeByDefault('File') : nls.localizeByDefault('Files');
        if (options.useTrash) {
            title = nls.localize('theia/workspace/trashTitle', 'Move {0} to Trash', title);
        } else {
            title = nls.localizeByDefault('Delete {0}', title);
        }
        return new ConfirmDialog({
            title,
            msg: this.getConfirmMessage(uris)
        }).open();
    }

    /**
     * Get the dialog confirmation message for deletion.
     *
     * @param uris URIs of selected resources.
     */
    protected getConfirmMessage(uris: URI[]): string | HTMLElement {
        const dirty = this.getDirty(uris);
        if (dirty.length) {
            if (dirty.length === 1) {
                return nls.localize('theia/workspace/confirmMessage.dirtySingle', 'Do you really want to delete {0} with unsaved changes?', dirty[0].path.base);
            }
            return nls.localize('theia/workspace/confirmMessage.dirtyMultiple', 'Do you really want to delete {0} files with unsaved changes?', dirty.length);
        }
        if (uris.length === 1) {
            return nls.localize('theia/workspace/confirmMessage.uriSingle', 'Do you really want to delete {0}?', uris[0].path.base);
        }
        if (uris.length > 10) {
            return nls.localize('theia/workspace/confirmMessage.uriMultiple', 'Do you really want to delete all the {0} selected files?', uris.length);
        }
        const messageContainer = document.createElement('div');
        messageContainer.textContent = nls.localize('theia/workspace/confirmMessage.delete', 'Do you really want to delete the following files?');
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

    /**
     * Get which URI are presently dirty.
     *
     * @param uris URIs of selected resources.
     * @returns An array of dirty URI.
     */
    protected getDirty(uris: URI[]): URI[] {
        const dirty = new Map<string, URI>();
        const widgets = NavigatableWidget.getAffected(SaveableWidget.getDirty(this.shell.widgets), uris);
        for (const [resourceUri] of widgets) {
            dirty.set(resourceUri.toString(), resourceUri);
        }
        return [...dirty.values()];
    }

    /**
     * Perform deletion of a given URI.
     *
     * @param uri URI of selected resource.
     * @param options deletion options.
     */
    protected async delete(uri: URI, options: FileDeleteOptions): Promise<void> {
        try {
            await Promise.all([
                this.closeWithoutSaving(uri),
                options.useTrash ? this.moveFileToTrash(uri, options) : this.deleteFilePermanently(uri, options)
            ]);
        } catch (e) {
            console.error(e);
        }
    }

    protected async deleteFilePermanently(uri: URI, options: FileDeleteOptions): Promise<void> {
        this.fileService.delete(uri, { ...options, useTrash: false });
    }

    protected async moveFileToTrash(uri: URI, options: FileDeleteOptions): Promise<void> {
        try {
            await this.fileService.delete(uri, { ...options, useTrash: true });
        } catch (error) {
            console.error('Error deleting with trash:', error);
            if (await this.confirmDeletePermanently(uri)) {
                return this.deleteFilePermanently(uri, options);
            }
        }
    }

    /**
     * Display dialog to confirm the permanent deletion of a file.
     *
     * @param uri URI of selected resource.
     */
    protected async confirmDeletePermanently(uri: URI): Promise<boolean> {
        const title = nls.localize('theia/workspace/confirmDeletePermanently.title', 'Error deleting file');

        const msg = document.createElement('div');

        const question = document.createElement('p');
        question.textContent = nls.localize('theia/workspace/confirmDeletePermanently.description',
            'Failed to delete "{0}" using the Trash. Do you want to permanently delete instead?',
            uri.path.base);
        msg.append(question);

        const info = document.createElement('p');
        info.textContent = nls.localize('theia/workspace/confirmDeletePermanently.solution', 'You can disable the use of Trash in the preferences.');
        msg.append(info);

        const response = await new ConfirmDialog({ title, msg }).open();
        return response || false;
    }

    /**
     * Close widget without saving changes.
     *
     * @param uri URI of a selected resource.
     */
    protected async closeWithoutSaving(uri: URI): Promise<void> {
        const toClose = [...NavigatableWidget.getAffected(this.shell.widgets, uri)].map(([, widget]) => widget);
        await this.shell.closeMany(toClose, { save: false });
    }
}
