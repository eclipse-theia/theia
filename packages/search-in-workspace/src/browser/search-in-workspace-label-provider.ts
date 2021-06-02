/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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
import { LabelProviderContribution, LabelProvider, DidChangeLabelEvent } from '@theia/core/lib/browser/label-provider';
import { SearchInWorkspaceRootFolderNode, SearchInWorkspaceFileNode } from './search-in-workspace-result-tree-widget';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class SearchInWorkspaceLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    canHandle(element: object): number {
        return SearchInWorkspaceRootFolderNode.is(element) || SearchInWorkspaceFileNode.is(element) ? 100 : 0;
    }

    getIcon(node: SearchInWorkspaceRootFolderNode | SearchInWorkspaceFileNode): string {
        if (SearchInWorkspaceFileNode.is(node)) {
            return this.labelProvider.getIcon(new URI(node.fileUri).withScheme('file'));
        }
        return this.labelProvider.folderIcon;
    }

    getName(node: SearchInWorkspaceRootFolderNode | SearchInWorkspaceFileNode): string {
        const uri = SearchInWorkspaceFileNode.is(node) ? node.fileUri : node.folderUri;
        return new URI(uri).displayName;
    }

    affects(node: SearchInWorkspaceRootFolderNode | SearchInWorkspaceFileNode, event: DidChangeLabelEvent): boolean {
        return SearchInWorkspaceFileNode.is(node) && event.affects(new URI(node.fileUri).withScheme('file'));
    }

}
