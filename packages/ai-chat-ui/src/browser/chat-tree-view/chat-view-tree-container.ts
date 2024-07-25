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

import { createTreeContainer, TreeProps } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { ChatViewTreeWidget } from './chat-view-tree-widget';

const CHAT_VIEW_TREE_PROPS = {
    multiSelect: false,
    search: false,
} as TreeProps;

export function createChatViewTreeWidget(parent: interfaces.Container): ChatViewTreeWidget {
    const child = createTreeContainer(parent, {
        props: CHAT_VIEW_TREE_PROPS,
        widget: ChatViewTreeWidget,
    });
    return child.get(ChatViewTreeWidget);
}
