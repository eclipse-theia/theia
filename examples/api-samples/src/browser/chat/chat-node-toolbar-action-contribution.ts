// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

import {
    ChatNodeToolbarActionContribution
} from '@theia/ai-chat-ui/lib/browser/chat-node-toolbar-action-contribution';
import {
    isResponseNode,
    RequestNode,
    ResponseNode
} from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import { interfaces } from '@theia/core/shared/inversify';

export function bindChatNodeToolbarActionContribution(bind: interfaces.Bind): void {
    bind(ChatNodeToolbarActionContribution).toDynamicValue(context => ({
        getToolbarActions: (args: RequestNode | ResponseNode) => {
            if (isResponseNode(args)) {
                return [{
                    commandId: 'sample-command',
                    icon: 'codicon codicon-feedback',
                    tooltip: 'API Samples: Example command'
                }];
            } else {
                return [];
            }
        }
    }));
}
