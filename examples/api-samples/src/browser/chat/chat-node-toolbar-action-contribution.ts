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
import { Emitter, PreferenceService } from '@theia/core/lib/common';
import { interfaces } from '@theia/core/shared/inversify';
import { SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF } from './sample-chat-node-toolbar-preferences';

export function bindChatNodeToolbarActionContribution(bind: interfaces.Bind): void {
    bind(ChatNodeToolbarActionContribution).toDynamicValue(context => {
        const preferences = context.container.get<PreferenceService>(PreferenceService);
        // Fire `onDidChange` when the gating setting is toggled, so the chat view re-renders its node
        // toolbars live (rather than only picking up the change on the next response).
        const onDidChangeEmitter = new Emitter<void>();
        preferences.onPreferenceChanged(event => {
            if (event.preferenceName === SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF) {
                onDidChangeEmitter.fire();
            }
        });
        return {
            onDidChange: onDidChangeEmitter.event,
            getToolbarActions: (args: RequestNode | ResponseNode) => {
                // Gated by a contributed setting (surfaced in the AI Configuration view): when disabled, the
                // sample action is not rendered on response nodes.
                if (isResponseNode(args) && preferences.get<boolean>(SAMPLE_CHAT_NODE_TOOLBAR_ENABLED_PREF, true)) {
                    return [{
                        commandId: 'sample-command',
                        icon: 'codicon codicon-feedback',
                        tooltip: 'API Samples: Example command'
                    }];
                }
                return [];
            }
        };
    });
}
