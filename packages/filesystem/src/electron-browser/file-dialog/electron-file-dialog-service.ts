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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FileFilter, OpenDialogOptions, SaveDialogOptions } from '@theia/core/electron-shared/electron';
import * as electronRemote from '@theia/core/electron-shared/@electron/remote';
import URI from '@theia/core/lib/common/uri';
import { isOSX, OS } from '@theia/core/lib/common/os';
import { MaybeArray } from '@theia/core/lib/common/types';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FileStat } from '../../common/files';
import { FileAccess } from '../../common/filesystem';
import { DefaultFileDialogService, OpenFileDialogProps, SaveFileDialogProps } from '../../browser/file-dialog';

// See https://github.com/electron/electron/blob/v9.0.2/docs/api/dialog.md
// These properties get extended with newer versions of Electron
type DialogProperties = 'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' |
    'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent';

//
// We are OK to use this here because the electron backend and frontend are on the same host.
// If required, we can move this single service (and its module) to a dedicated Theia extension,
// and at packaging time, clients can decide whether they need the native or the browser-based
// solution.
//
// eslint-disable-next-line @theia/runtime-import-check
import { FileUri } from '@theia/core/lib/node/file-uri';

@injectable()
export class ElectronFileDialogService extends DefaultFileDialogService {

    @inject(MessageService) protected readonly messageService: MessageService;

    override async showOpenDialog(props: OpenFileDialogProps & { canSelectMany: true }, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;
    override async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<URI | undefined>;
    override async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<MaybeArray<URI> | undefined> {
        const rootNode = await this.getRootNode(folder);
        if (rootNode) {
            const { filePaths } = props.modal !== false ?
                await electronRemote.dialog.showOpenDialog(electronRemote.getCurrentWindow(), this.toOpenDialogOptions(rootNode.uri, props)) :
                await electronRemote.dialog.showOpenDialog(this.toOpenDialogOptions(rootNode.uri, props));
            if (filePaths.length === 0) {
                return undefined;
            }

            const uris = filePaths.map(path => FileUri.create(path));
            const canAccess = await this.canRead(uris);
            const result = canAccess ? uris.length === 1 ? uris[0] : uris : undefined;
            return result;
        }
        return undefined;
    }

    override async showSaveDialog(props: SaveFileDialogProps, folder?: FileStat): Promise<URI | undefined> {
        const rootNode = await this.getRootNode(folder);
        if (rootNode) {
            const { filePath } = props.modal !== false ?
                await electronRemote.dialog.showSaveDialog(electronRemote.getCurrentWindow(), this.toSaveDialogOptions(rootNode.uri, props)) :
                await electronRemote.dialog.showSaveDialog(this.toSaveDialogOptions(rootNode.uri, props));
            if (!filePath) {
                return undefined;
            }

            const uri = FileUri.create(filePath);
            const exists = await this.fileService.exists(uri);
            if (!exists) {
                return uri;
            }

            const canWrite = await this.canReadWrite(uri);
            return canWrite ? uri : undefined;
        }
        return undefined;
    }

    protected async canReadWrite(uris: MaybeArray<URI>): Promise<boolean> {
        for (const uri of Array.isArray(uris) ? uris : [uris]) {
            if (!(await this.fileService.access(uri, FileAccess.Constants.R_OK | FileAccess.Constants.W_OK))) {
                this.messageService.error(`Cannot access resource at ${uri.path}.`);
                return false;
            }
        }
        return true;
    }

    protected async canRead(uris: MaybeArray<URI>): Promise<boolean> {
        const resources = Array.isArray(uris) ? uris : [uris];
        const unreadableResourcePaths: string[] = [];
        await Promise.all(resources.map(async resource => {
            if (!await this.fileService.access(resource, FileAccess.Constants.R_OK)) {
                unreadableResourcePaths.push(resource.path.toString());
            }
        }));
        if (unreadableResourcePaths.length > 0) {
            this.messageService.error(`Cannot read ${unreadableResourcePaths.length} resource(s): ${unreadableResourcePaths.join(', ')}`);
        }
        return unreadableResourcePaths.length === 0;
    }

    protected toDialogOptions(uri: URI, props: SaveFileDialogProps | OpenFileDialogProps, dialogTitle: string): electron.FileDialogProps {
        type Mutable<T> = { -readonly [K in keyof T]: T[K] };
        const electronProps: Mutable<electron.FileDialogProps> = {
            title: props.title || dialogTitle,
            defaultPath: FileUri.fsPath(uri),
        };
        const {
            canSelectFiles = true,
            canSelectFolders = false,
        } = props as OpenFileDialogProps;
        if (!isOSX && canSelectFiles && canSelectFolders) {
            console.warn('canSelectFiles === true && canSelectFolders === true is only supported on OSX!');
        }
        if ((isOSX && canSelectFiles) || !canSelectFolders) {
            electronProps.filters = props.filters ? Object.entries(props.filters).map(([name, extensions]) => ({ name, extensions })) : [];
            if (this.shouldAddAllFilesFilter(electronProps)) {
                electronProps.filters.push({ name: 'All Files', extensions: ['*'] });
            }
        }
        return electronProps;
    }

    /**
     * Specifies whether an _All Files_ filter should be added to the dialog.
     *
     * On Linux, the _All Files_ filter [hides](https://github.com/eclipse-theia/theia/issues/11321) files without an extension.
     * The bug is resolved in Electron >=18.
     */
    protected shouldAddAllFilesFilter(electronProps: electron.FileDialogProps): boolean {
        const foundFilters = !!electronProps.filters && electronProps.filters.length > 0;
        const isNotLinux = OS.type() !== OS.Type.Linux;
        return isNotLinux || foundFilters;
    }

    protected toOpenDialogOptions(uri: URI, props: OpenFileDialogProps): OpenDialogOptions {
        const properties = electron.dialog.toDialogProperties(props);
        const buttonLabel = props.openLabel;
        return { ...this.toDialogOptions(uri, props, 'Open'), properties, buttonLabel };
    }

    protected toSaveDialogOptions(uri: URI, props: SaveFileDialogProps): SaveDialogOptions {
        const buttonLabel = props.saveLabel;
        if (props.inputValue) {
            uri = uri.resolve(props.inputValue);
        }
        const defaultPath = FileUri.fsPath(uri);
        return { ...this.toDialogOptions(uri, props, 'Save'), buttonLabel, defaultPath };
    }

}

export namespace electron {

    /**
     * Common "super" interface of the `electron.SaveDialogOptions` and `electron.OpenDialogOptions` types.
     */
    export interface FileDialogProps {

        /**
         * The dialog title.
         */
        readonly title?: string;

        /**
         * The default path, where the dialog opens. Requires an FS path.
         */
        readonly defaultPath?: string;

        /**
         * Resource filter.
         */
        readonly filters?: FileFilter[];

    }

    export namespace dialog {

        /**
         * Converts the Theia specific `OpenFileDialogProps` into an electron specific array.
         *
         * Note: On Windows and Linux an open dialog can not be both a file selector and a directory selector,
         * so if you set properties to ['openFile', 'openDirectory'] on these platforms, a directory selector will be shown.
         *
         * See: https://github.com/electron/electron/issues/10252#issuecomment-322012159
         */
        export function toDialogProperties(props: OpenFileDialogProps): Array<DialogProperties> {
            if (!isOSX && props.canSelectFiles !== false && props.canSelectFolders === true) {
                console.warn(`Cannot have 'canSelectFiles' and 'canSelectFolders' at the same time. Fallback to 'folder' dialog. \nProps was: ${JSON.stringify(props)}.`);

                // Given that both props are set, fallback to using a `folder` dialog.
                props.canSelectFiles = false;
                props.canSelectFolders = true;
            }
            const properties: Array<DialogProperties> = [];
            if (!isOSX) {
                if (props.canSelectFiles !== false && props.canSelectFolders !== true) {
                    properties.push('openFile');
                }
                if (props.canSelectFolders === true && props.canSelectFiles === false) {
                    properties.push('openDirectory');
                }
            } else {
                if (props.canSelectFiles !== false) {
                    properties.push('openFile');
                }
                if (props.canSelectFolders === true) {
                    properties.push('openDirectory');
                    properties.push('createDirectory');
                }
            }
            if (props.canSelectMany === true) {
                properties.push('multiSelections');
            }
            return properties;
        }
    }
}
