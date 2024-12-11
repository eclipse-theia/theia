// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { RequestNode, ResponseNode } from './chat-tree-view';

export interface ChatNodeToolbarAction {
    /**
     * The command to execute when the item is selected. The handler will receive the `RequestNode` or `ResponseNode` as first argument.
     */
    commandId: string;
    /**
     * Icon class name(s) for the item (e.g. 'codicon codicon-feedback').
     */
    icon: string;
    /**
     * Priority among the items. Can be negative. The smaller the number the left-most the item will be placed in the toolbar. It is `0` by default.
     */
    priority?: number;
    /**
     * Optional tooltip for the item.
     */
    tooltip?: string;
}

/**
 * Clients implement this interface if they want to contribute to the toolbar of chat nodes.
 *
 * ### Example
 * ```ts
 * bind(ChatNodeToolbarActionContribution).toDynamicValue(context => ({
 *  getToolbarActions: (args: RequestNode | ResponseNode) => {
 *      if (isResponseNode(args)) {
 *          return [{
 *              commandId: 'core.about',
 *              icon: 'codicon codicon-feedback',
 *              tooltip: 'Show about dialog on response nodes'
 *          }];
 *      } else {
 *          return [];
 *      }
 *  }
 * }));
 * ```
 */
export const ChatNodeToolbarActionContribution = Symbol('ChatNodeToolbarActionContribution');
export interface ChatNodeToolbarActionContribution {
    /**
     * Returns the toolbar actions for the given node.
     */
    getToolbarActions(node: RequestNode | ResponseNode): ChatNodeToolbarAction[];
}
