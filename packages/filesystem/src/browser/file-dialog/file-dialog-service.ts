/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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
import { MaybeArray } from '@theia/core/lib/common';
import { LabelProvider } from '@theia/core/lib/browser';
import { FileSystem, FileStat } from '../../common';
import { DirNode } from '../file-tree';
import { OpenFileDialogFactory, OpenFileDialogProps, SaveFileDialogFactory, SaveFileDialogProps } from './file-dialog';

export const FileDialogService = Symbol('FileDialogService');
export interface FileDialogService {

    showOpenDialog(props: OpenFileDialogProps & { canSelectMany: true }, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;
    showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<URI | undefined>;
    showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;

    showSaveDialog(props: SaveFileDialogProps, folder?: FileStat): Promise<URI | undefined>

}

@injectable()
export class DefaultFileDialogService {

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(OpenFileDialogFactory) protected readonly openFileDialogFactory: OpenFileDialogFactory;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(SaveFileDialogFactory) protected readonly saveFileDialogFactory: SaveFileDialogFactory;

    async showOpenDialog(props: OpenFileDialogProps & { canSelectMany: true }, folder?: FileStat): Promise<MaybeArray<URI> | undefined>;
    async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<URI | undefined>;
    async showOpenDialog(props: OpenFileDialogProps, folder?: FileStat): Promise<MaybeArray<URI> | undefined> {
        const title = props.title || 'Open';
        const rootNode = await this.getRootNode(folder);
        if (rootNode) {
            const dialog = this.openFileDialogFactory(Object.assign(props, { title }));
            await dialog.model.navigateTo(rootNode);
            const value = await dialog.open();
            if (value) {
                if (!Array.isArray(value)) {
                    return value.uri;
                }
                return value.map(node => node.uri);
            }
        }
        return undefined;
    }

    async showSaveDialog(props: SaveFileDialogProps, folder?: FileStat): Promise<URI | undefined> {
        const title = props.title || 'Save';
        const rootNode = await this.getRootNode(folder);
        if (rootNode) {
            const dialog = this.saveFileDialogFactory(Object.assign(props, { title }));
            await dialog.model.navigateTo(rootNode);
            return dialog.open();
        }
        return undefined;
    }

    protected async getRootNode(folderToOpen?: FileStat): Promise<DirNode | undefined> {
        const folder = folderToOpen || await this.fileSystem.getCurrentUserHome();
        if (folder) {
            const rootUri = new URI(folder.uri).parent;
            const name = this.labelProvider.getName(rootUri);
            const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
            if (rootStat) {
                const label = await this.labelProvider.getIcon(rootStat);
                return DirNode.createRoot(rootStat, name, label);
            }
        }
        return undefined;
    }
}
