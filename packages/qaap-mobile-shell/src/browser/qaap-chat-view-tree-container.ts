// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { createTreeContainer, TreeProps } from '@theia/core/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { QaapChatViewTreeWidget } from './qaap-chat-view-tree-widget';

const QAAP_CHAT_VIEW_TREE_PROPS = {
    multiSelect: false,
    search: false,
} as TreeProps;

export function createQaapChatViewTreeWidget(parent: interfaces.Container): QaapChatViewTreeWidget {
    const child = createTreeContainer(parent, {
        props: QAAP_CHAT_VIEW_TREE_PROPS,
        widget: QaapChatViewTreeWidget,
    });
    return child.get(QaapChatViewTreeWidget);
}
