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
import URI from '@theia/core/lib/common/uri';
import { LabelProviderContribution, LabelProvider, URIIconReference } from '@theia/core/lib/browser/label-provider';
import { TreeLabelProvider } from '@theia/core/lib/browser/tree/tree-label-provider';
import { TreeViewNode } from './tree-view-widget';
import { TreeNode } from '@theia/core/lib/browser/tree/tree';

@injectable()
export class PluginTreeViewNodeLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(TreeLabelProvider)
    protected readonly treeLabelProvider: TreeLabelProvider;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    canHandle(element: TreeViewNode | any): number {
        if (TreeNode.is(element) && ('resourceUri' in element || 'themeIconId' in element)) {
            return this.treeLabelProvider.canHandle(element) + 1;
        }
        return 0;
    }

    getIcon(node: TreeViewNode): string | undefined {
        if (node.icon) {
            return node.icon;
        }
        if (node.themeIconId) {
            if (node.themeIconId === 'file' || node.themeIconId === 'folder') {
                const uri = node.resourceUri && new URI(node.resourceUri) || undefined;
                return this.labelProvider.getIcon(URIIconReference.create(node.themeIconId, uri));
            }
            return monaco.theme.ThemeIcon.asClassName({ id: node.themeIconId });
        }
        if (node.resourceUri) {
            return this.labelProvider.getIcon(new URI(node.resourceUri));
        }
        return undefined;
    }

    getName(node: TreeViewNode): string | undefined {
        if (node.name) {
            return node.name;
        }
        if (node.resourceUri) {
            return this.labelProvider.getName(new URI(node.resourceUri));
        }
        return undefined;
    }

    getLongName(node: TreeViewNode): string | undefined {
        if (typeof node.description === 'string') {
            return node.description;
        }
        if (node.description === true && node.resourceUri) {
            return this.labelProvider.getLongName(new URI(node.resourceUri));
        }
        return undefined;
    }

}
