// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { TreeWidget } from './tree-widget';
import { SelectableTreeNode } from './tree-selection';

export type TreeWidgetSelection = ReadonlyArray<Readonly<SelectableTreeNode>> & {
    source: TreeWidget
};
export namespace TreeWidgetSelection {
    export function isSource(selection: unknown, source: TreeWidget): selection is TreeWidgetSelection {
        return getSource(selection) === source;
    }
    export function getSource(selection: unknown): TreeWidget | undefined {
        return is(selection) ? selection.source : undefined;
    }
    export function is(selection: unknown): selection is TreeWidgetSelection {
        return Array.isArray(selection) && ('source' in selection) && (selection as TreeWidgetSelection).source instanceof TreeWidget;
    }

    export function create(source: TreeWidget): TreeWidgetSelection {
        const focusedNode = source.model.getFocusedNode();
        const selectedNodes = source.model.selectedNodes;
        const focusedIndex = selectedNodes.indexOf(focusedNode as SelectableTreeNode);
        // Ensure that the focused node is at index 0 - used as default single selection.
        if (focusedNode && focusedIndex > 0) {
            const selection = [focusedNode, ...selectedNodes.slice(0, focusedIndex), ...selectedNodes.slice(focusedIndex + 1)];
            return Object.assign(selection, { source });
        }
        return Object.assign(selectedNodes, { source });
    }
}
