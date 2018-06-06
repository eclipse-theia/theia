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
import { FileSystem, FileStat } from '../common';
import { FileStatNode, DirNode } from './file-tree';
import { FileDialogFactory, FileDialogProps } from './file-dialog';
import URI from '@theia/core/lib/common/uri';
import { LabelProvider } from '@theia/core/lib/browser';

@injectable()
export class FileDialogService {
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(FileDialogFactory) protected readonly fileDialogFactory: FileDialogFactory;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    async show(props: FileDialogProps, folder?: FileStat): Promise<FileStatNode | undefined> {
        const title = props && props.title ? props.title : 'Open';
        const folderToOpen = folder || await this.fileSystem.getCurrentUserHome();
        if (folderToOpen) {
            const rootUri = new URI(folderToOpen.uri).parent;
            const name = this.labelProvider.getName(rootUri);
            const [rootStat, label] = await Promise.all([
                this.fileSystem.getFileStat(rootUri.toString()),
                this.labelProvider.getIcon(folderToOpen)
            ]);
            if (rootStat) {
                const rootNode = DirNode.createRoot(rootStat, name, label);
                const dialog = this.fileDialogFactory({ title });
                dialog.model.navigateTo(rootNode);
                const nodes = await dialog.open();
                return Array.isArray(nodes) ? nodes[0] : nodes;
            }
        }
    }
}
