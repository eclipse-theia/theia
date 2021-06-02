/********************************************************************************
 * Copyright (C) 2020 Arm and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { LabelProviderContribution, LabelProvider } from '@theia/core/lib/browser/label-provider';
import { TreeNode } from '@theia/core/lib/browser/tree';
import { ScmFileChangeFolderNode, ScmFileChangeNode, ScmFileChangeGroupNode } from './scm-tree-model';

@injectable()
export class ScmTreeLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    canHandle(element: object): number {
        return TreeNode.is(element) && (ScmFileChangeGroupNode.is(element) || ScmFileChangeFolderNode.is(element) || ScmFileChangeNode.is(element)) ? 60 : 0;
    }

    getName(node: ScmFileChangeFolderNode | ScmFileChangeNode): string {
        if (ScmFileChangeGroupNode.is(node)) {
            return node.groupLabel;
        }
        if (ScmFileChangeFolderNode.is(node)) {
            return node.path;
        }
        if (ScmFileChangeNode.is(node)) {
            return this.labelProvider.getName(new URI(node.sourceUri));
        }
        return '';
    }
}
