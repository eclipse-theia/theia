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

import { injectable, inject } from '@theia/core/shared/inversify';
import { TreeModelImpl, TreeNode } from '@theia/core/lib/browser';
import { CallHierarchyTree, DefinitionNode } from './callhierarchy-tree';
import { CallHierarchyServiceProvider } from '../callhierarchy-service';
import { Position } from '@theia/core/shared/vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';

@injectable()
export class CallHierarchyTreeModel extends TreeModelImpl {

    private _languageId: string | undefined;

    @inject(CallHierarchyTree) protected readonly tree: CallHierarchyTree;
    @inject(CallHierarchyServiceProvider) protected readonly callHierarchyServiceProvider: CallHierarchyServiceProvider;

    getTree(): CallHierarchyTree {
        return this.tree;
    }

    get languageId(): string | undefined {
        return this._languageId;
    }

    async initializeCallHierarchy(languageId: string | undefined, uri: string | undefined, position: Position | undefined): Promise<void> {
        this.tree.root = undefined;
        this.tree.callHierarchyService = undefined;
        this._languageId = languageId;
        if (languageId && uri && position) {
            const callHierarchyService = this.callHierarchyServiceProvider.get(languageId, new URI(uri));
            if (callHierarchyService) {
                this.tree.callHierarchyService = callHierarchyService;
                const cancellationSource = new CancellationTokenSource();
                const rootDefinition = await callHierarchyService.getRootDefinition(uri, position, cancellationSource.token);
                if (rootDefinition) {
                    const rootNode = DefinitionNode.create(rootDefinition, undefined);
                    this.tree.root = rootNode;
                }
            }
        }
    }

    protected doOpenNode(node: TreeNode): void {
        // do nothing (in particular do not expand the node)
    }
}
