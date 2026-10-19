// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { LabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import { FileTreeLabelProvider } from '@theia/filesystem/lib/browser/file-tree/file-tree-label-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceRootNode } from './navigator-tree';

/**
 * Shows the name given to a workspace root in the workspace file on its node in the navigator.
 * The name is only shown for the root node: where the folder appears otherwise, e.g. nested in another root, it shows its folder name, as in VS Code.
 */
@injectable()
export class WorkspaceRootNodeLabelProvider implements LabelProviderContribution {

    @inject(FileTreeLabelProvider)
    protected readonly fileTreeLabelProvider: FileTreeLabelProvider;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    canHandle(element: object): number {
        return WorkspaceRootNode.is(element) ? this.fileTreeLabelProvider.canHandle(element) + 1 : 0;
    }

    /** Returns the name of the root, or `undefined` to fall back to the label of the file tree node. */
    getName(node: WorkspaceRootNode): string | undefined {
        return this.workspaceService.getWorkspaceRootName(node.uri);
    }

}
