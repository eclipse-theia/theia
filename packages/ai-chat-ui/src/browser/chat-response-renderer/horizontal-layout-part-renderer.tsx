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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import {
    ChatResponseContent,
    HorizontalLayoutChatResponseContent,
} from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';
import { ContributionProvider } from '@theia/core';
import { ResponseNode } from '../chat-tree-view/chat-view-tree-widget';

@injectable()
export class HorizontalLayoutPartRenderer
    implements ChatResponsePartRenderer<ChatResponseContent> {
    @inject(ContributionProvider)
    @named(ChatResponsePartRenderer)
    protected readonly chatResponsePartRenderers: ContributionProvider<
        ChatResponsePartRenderer<ChatResponseContent>
    >;

    canHandle(response: ChatResponseContent): number {
        if (HorizontalLayoutChatResponseContent.is(response)) {
            return 10;
        }
        return -1;
    }
    render(response: HorizontalLayoutChatResponseContent, parentNode: ResponseNode): ReactNode {
        const contributions = this.chatResponsePartRenderers.getContributions();
        return (
            <div className="ai-chat-horizontal-layout" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                {response.content.map(content => {
                    const renderer = contributions
                        .map(c => ({
                            prio: c.canHandle(content),
                            renderer: c,
                        }))
                        .sort((a, b) => b.prio - a.prio)[0].renderer;
                    return renderer.render(content, parentNode);
                })}
            </div>
        );
    }
}
