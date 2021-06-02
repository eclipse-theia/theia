/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
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

import { LabelProvider, LabelProviderContribution, TreeNode } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ResourcePropertiesCategoryNode, ResourcePropertiesItemNode } from './resource-property-view-tree-items';

const DEFAULT_INFO_ICON = 'fa fa-info-circle';

@injectable()
export class ResourcePropertiesLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

    canHandle(element: TreeNode): number {
        return (ResourcePropertiesCategoryNode.is(element) || ResourcePropertiesItemNode.is(element)) ? 75 : 0;
    }

    getIcon(node: ResourcePropertiesCategoryNode | ResourcePropertiesItemNode): string {
        if (ResourcePropertiesCategoryNode.is(node)) {
            return node.icon ?? DEFAULT_INFO_ICON;
        }
        return node.icon ?? '';
    }

    getName(node: ResourcePropertiesCategoryNode | ResourcePropertiesItemNode): string {
        return node.name;
    }

    getLongName(node: ResourcePropertiesCategoryNode | ResourcePropertiesItemNode): string {
        if (ResourcePropertiesItemNode.is(node)) {
            return node.property;
        }
        return this.getName(node);
    }
}
