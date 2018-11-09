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

import { injectable } from 'inversify';
import { DirNode, FileTree } from '../file-tree';
import { TreeNode, CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { FileStat } from '../../common';

@injectable()
export class FileDialogTree extends FileTree {

    /**
     * Extensions for files to be shown
     */
    protected fileExtensions: string[] = [];

    /**
     * Sets extensions for filtering files
     *
     * @param fileExtensions array of extensions
     */
    setFilter(fileExtensions: string[]): void {
        this.fileExtensions = fileExtensions.slice();
        this.refresh();
    }

    protected async toNodes(fileStat: FileStat, parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!fileStat.children) {
            return [];
        }

        const result = await Promise.all(
            fileStat.children
                .filter(child => this.isVisible(child))
                .map(async child => await this.toNode(child, parent))
        );

        return result.sort(DirNode.compare);
    }

    /**
     * Determines whether file or folder can be shown
     *
     * @param fileStat resource to check
     */
    protected isVisible(fileStat: FileStat): boolean {
        if (fileStat.isDirectory) {
            return true;
        }

        if (this.fileExtensions.length === 0) {
            return true;
        }

        return !this.fileExtensions.every(value => !fileStat.uri.endsWith('.' + value));
    }

}
