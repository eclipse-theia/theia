// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ProgressMessage } from '../chat-progress-message';
import { ChatViewTreeWidget, ResponseNode } from './chat-view-tree-widget';
import * as React from '@theia/core/shared/react';
import { ContributionProvider } from '@theia/core';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ChatNodeToolbarActionContribution } from '../chat-node-toolbar-action-contribution';
import { ChatResponseContent } from '@theia/ai-chat';
import { ContextMenuRenderer, TreeNode } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

/**
 * Subset of the ChatViewTreeWidget used to render ResponseNodes for delegated prompts.
 */
@injectable()
export class SubChatWidget {

    @inject(ContributionProvider) @named(ChatResponsePartRenderer)
    protected readonly chatResponsePartRenderers: ContributionProvider<ChatResponsePartRenderer<ChatResponseContent>>;

    @inject(ContributionProvider) @named(ChatNodeToolbarActionContribution)
    protected readonly chatNodeToolbarActionContributions: ContributionProvider<ChatNodeToolbarActionContribution>;

    @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer;

    renderChatResponse(node: ResponseNode): React.ReactNode {
        return (
            <div className={'theia-ResponseNode'}>
                {!node.response.isComplete
                    && node.response.response.content.length === 0
                    && node.response.progressMessages
                        .filter(c => c.show === 'untilFirstContent')
                        .map((c, i) =>
                            <ProgressMessage {...c} key={`${node.id}-progress-untilFirstContent-${i}`} />
                        )
                }
                {node.response.response.content.map((c, i) =>
                    <div className='theia-ResponseNode-Content' key={`${node.id}-content-${i}`}>{this.getChatResponsePartRenderer(c, node)}</div>
                )}
                {!node.response.isComplete
                    && node.response.progressMessages
                        .filter(c => c.show === 'whileIncomplete')
                        .map((c, i) =>
                            <ProgressMessage {...c} key={`${node.id}-progress-whileIncomplete-${i}`} />
                        )
                }
                {node.response.progressMessages
                    .filter(c => c.show === 'forever')
                    .map((c, i) =>
                        <ProgressMessage {...c} key={`${node.id}-progress-afterComplete-${i}`} />
                    )
                }
            </div>
        );
    }

    protected getChatResponsePartRenderer(content: ChatResponseContent, node: ResponseNode): React.ReactNode {
        const renderer = this.chatResponsePartRenderers.getContributions().reduce<[number, ChatResponsePartRenderer<ChatResponseContent> | undefined]>(
            (prev, current) => {
                const prio = current.canHandle(content);
                if (prio > prev[0]) {
                    return [prio, current];
                } return prev;
            },
            [-1, undefined])[1];
        if (!renderer) {
            console.error('No renderer found for content', content);
            return <div>{nls.localize('theia/ai/chat-ui/chat-view-tree-widget/noRenderer', 'Error: No renderer found')}</div>;
        }
        return renderer.render(content, node);
    }

    protected handleContextMenu(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        this.contextMenuRenderer.render({
            menuPath: ChatViewTreeWidget.CONTEXT_MENU,
            anchor: { x: event.clientX, y: event.clientY },
            args: [node],
            context: event.currentTarget
        });
        event.preventDefault();
    }
}

export const SubChatWidgetFactory = Symbol('SubChatWidgetFactory');
export type SubChatWidgetFactory = () => SubChatWidget;
