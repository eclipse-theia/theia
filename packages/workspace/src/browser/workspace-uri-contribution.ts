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

import { DefaultUriLabelProviderContribution, FOLDER_ICON, FILE_ICON } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { injectable, inject, postConstruct } from 'inversify';
import { WorkspaceService } from './workspace-service';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common';
import { Disposable, DisposableCollection, MaybePromise } from '@theia/core';

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution implements Disposable {

    @inject(WorkspaceService)
    protected workspaceService: WorkspaceService;
    @inject(FileSystem)
    protected fileSystem: FileSystem;

    protected readonly toDispose = new DisposableCollection();

    baseUri: URI | undefined;

    @postConstruct()
    protected async init(): Promise<void> {
        this.updateBaseUri(await this.workspaceService.roots);
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(roots => {
            this.updateBaseUri(roots);
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Use the workspace folder uri as the base uri if there is only one root folder in workspace
     * Otherwise, set base uri to undefined.
     *
     * @param roots FileStat of root folders in the workspace
     */
    protected updateBaseUri(roots: FileStat[]): void {
        if (roots.length > 1) {
            this.baseUri = undefined;
        } else if (roots[0]) {
            this.baseUri = new URI(roots[0].uri);
        }
    }

    canHandle(element: object): number {
        if ((element instanceof URI && element.scheme === 'file' || FileStat.is(element))) {
            return 10;
        }
        return 0;
    }

    private getUri(element: URI | FileStat) {
        if (FileStat.is(element)) {
            return new URI(element.uri);
        }
        return new URI(element.toString());
    }

    private getStat(element: URI | FileStat): MaybePromise<FileStat | undefined> {
        if (FileStat.is(element)) {
            return element;
        }
        return this.fileSystem.getFileStat(element.toString());
    }

    async getIcon(element: URI | FileStat): Promise<string> {
        if (FileStat.is(element) && element.isDirectory) {
            return FOLDER_ICON;
        }
        const uri = this.getUri(element);
        const icon = super.getFileIcon(uri);
        if (!icon) {
            try {
                const stat = await this.getStat(element);
                return stat && stat.isDirectory ? FOLDER_ICON : FILE_ICON;
            } catch (err) {
                return FILE_ICON;
            }
        }
        return icon;
    }

    getName(element: URI | FileStat): string {
        return super.getName(this.getUri(element));
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    getLongName(element: URI | FileStat): string {
        const uri = this.getUri(element);
        if (this.baseUri) {
            const relativeUri = this.baseUri.relative(uri);
            if (relativeUri) {
                return relativeUri.toString();
            }
        }

        return super.getLongName(uri);
    }
}
