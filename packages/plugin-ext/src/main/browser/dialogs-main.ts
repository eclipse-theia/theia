/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { interfaces } from 'inversify';
import { RPCProtocol } from '../../common/rpc-protocol';
import { OpenDialogOptionsMain, SaveDialogOptionsMain, DialogsMain, UploadDialogOptionsMain } from '../../common/plugin-api-rpc';
import { DirNode, OpenFileDialogProps, SaveFileDialogProps, OpenFileDialogFactory, SaveFileDialogFactory, SaveFileDialog } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { UriSelection } from '@theia/core/lib/common/selection';
import URI from '@theia/core/lib/common/uri';
import { FileUploadService } from '@theia/filesystem/lib/browser/file-upload-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';

export class DialogsMainImpl implements DialogsMain {

    private workspaceService: WorkspaceService;
    private fileService: FileService;
    private environments: EnvVariablesServer;

    private openFileDialogFactory: OpenFileDialogFactory;
    private saveFileDialogFactory: SaveFileDialogFactory;
    private uploadService: FileUploadService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.workspaceService = container.get(WorkspaceService);
        this.fileService = container.get(FileService);
        this.environments = container.get(EnvVariablesServer);

        this.openFileDialogFactory = container.get(OpenFileDialogFactory);
        this.saveFileDialogFactory = container.get(SaveFileDialogFactory);
        this.uploadService = container.get(FileUploadService);
    }

    protected async getRootUri(defaultUri: string | undefined): Promise<FileStat | undefined> {
        let rootStat: FileStat | undefined;

        // Try to use default URI as root
        if (defaultUri) {
            try {
                rootStat = await this.fileService.resolve(new URI(defaultUri));
            } catch {
                rootStat = undefined;
            }
        }

        // Try to use as root the parent folder of existing file URI/non existing URI
        if (rootStat && !rootStat.isDirectory || !rootStat) {
            try {
                rootStat = await this.fileService.resolve(new URI(defaultUri).parent);
            } catch {
                rootStat = undefined;
            }
        }

        // Try to use workspace service root if there is no preconfigured URI
        if (!rootStat) {
            rootStat = (await this.workspaceService.roots)[0];
        }

        // Try to use current user home if root folder is still not taken
        if (!rootStat) {
            const homeDirUri = await this.environments.getHomeDirUri();
            try {
                rootStat = await this.fileService.resolve(new URI(homeDirUri));
            } catch { }
        }

        return rootStat;
    }

    async $showOpenDialog(options: OpenDialogOptionsMain): Promise<string[] | undefined> {
        const rootStat = await this.getRootUri(options.defaultUri ? options.defaultUri : undefined);

        // Fail if root not fount
        if (!rootStat) {
            throw new Error('Unable to find the rootStat');
        }

        // Take the info for root node
        const rootNode = DirNode.createRoot(rootStat);

        try {
            // Determine proper title for the dialog
            const canSelectFiles = typeof options.canSelectFiles === 'boolean' ? options.canSelectFiles : true;
            const canSelectFolders = typeof options.canSelectFolders === 'boolean' ? options.canSelectFolders : true;

            let title;
            if (canSelectFiles && canSelectFolders) {
                title = 'Open';
            } else {
                if (canSelectFiles) {
                    title = 'Open File';
                } else {
                    title = 'Open Folder';
                }

                if (options.canSelectMany) {
                    title += '(s)';
                }
            }

            // Create open file dialog props
            const dialogProps = {
                title: title,
                openLabel: options.openLabel,
                canSelectFiles: options.canSelectFiles,
                canSelectFolders: options.canSelectFolders,
                canSelectMany: options.canSelectMany,
                filters: options.filters
            } as OpenFileDialogProps;

            // Show open file dialog
            const dialog = this.openFileDialogFactory(dialogProps);
            dialog.model.navigateTo(rootNode);
            const result = await dialog.open();

            // Return the result
            return UriSelection.getUris(result).map(uri => uri.path.toString());
        } catch (error) {
            console.error(error);
        }

        return undefined;
    }

    async $showSaveDialog(options: SaveDialogOptionsMain): Promise<string | undefined> {
        const rootStat = await this.getRootUri(options.defaultUri ? options.defaultUri : undefined);

        // Fail if root not found
        if (!rootStat) {
            throw new Error('Unable to find the rootStat');
        }

        // Take the info for root node
        const rootNode = DirNode.createRoot(rootStat);

        // File name field should be empty unless the URI is a file
        let fileNameValue = '';
        if (options.defaultUri) {
            let defaultURIStat: FileStat | undefined;
            try {
                defaultURIStat = await this.fileService.resolve(new URI(options.defaultUri));
            } catch { }
            if (defaultURIStat && !defaultURIStat.isDirectory || !defaultURIStat) {
                fileNameValue = new URI(options.defaultUri).path.base;
            }
        }

        try {
            // Create save file dialog props
            const dialogProps = {
                title: 'Save',
                saveLabel: options.saveLabel,
                filters: options.filters,
                inputValue: fileNameValue
            } as SaveFileDialogProps;

            // Show save file dialog
            const dialog: SaveFileDialog = this.saveFileDialogFactory(dialogProps);
            dialog.model.navigateTo(rootNode);
            const result = await dialog.open();

            // Return the result
            if (result) {
                return result.path.toString();
            }

            return undefined;
        } catch (error) {
            console.error(error);
        }

        return undefined;
    }

    async $showUploadDialog(options: UploadDialogOptionsMain): Promise<string[] | undefined> {
        const rootStat = await this.getRootUri(options.defaultUri);

        // Fail if root not fount
        if (!rootStat) {
            throw new Error('Failed to resolve base directory where files should be uploaded');
        }

        const uploadResult = await this.uploadService.upload(rootStat.resource.toString());

        if (uploadResult) {
            return uploadResult.uploaded;
        }

        return undefined;
    }

}
