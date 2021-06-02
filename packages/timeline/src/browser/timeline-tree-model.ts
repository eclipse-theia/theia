/********************************************************************************
 * Copyright (C) 2020 RedHat and others.
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

import { injectable } from '@theia/core/shared/inversify';
import {
    CompositeTreeNode,
    SelectableTreeNode,
    TreeModelImpl,
} from '@theia/core/lib/browser/tree';
import { TimelineItem } from '../common/timeline-model';
import { TimelineContribution } from './timeline-contribution';

export interface TimelineNode extends SelectableTreeNode {
    timelineItem: TimelineItem;
}

@injectable()
export class TimelineTreeModel extends TreeModelImpl {

    updateTree(items: TimelineItem[], hasMoreItems: boolean): void {
        const root = {
            id: 'timeline-tree-root',
            parent: undefined,
            visible: false,
            children: []
        } as CompositeTreeNode;
        const children = items.map(item =>
        ({
            timelineItem: item,
            id: item.id ? item.id : item.timestamp.toString(),
            parent: root,
            detail: item.detail,
            selected: false,
            visible: true
        } as TimelineNode)
        );
        let loadMore;
        if (hasMoreItems) {
            const loadMoreNode: TimelineItem = { label: 'Load-more', timestamp: 0, handle: '', uri: '', source: '' };
            loadMoreNode.command = TimelineContribution.LOAD_MORE_COMMAND;
            loadMore = {
                timelineItem: loadMoreNode,
                id: 'load-more',
                parent: root,
                selected: true
            } as TimelineNode;
            children.push(loadMore);
        }
        root.children = children;
        this.root = root;
        if (loadMore) {
            this.selectionService.addSelection(loadMore);
        }
    }
}
