// *****************************************************************************
// Copyright (C) 2020 RedHat and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandRegistry, MenuModelRegistry, MenuPath } from '@theia/core/lib/common';
import { TreeWidget, TreeProps, NodeProps, TREE_NODE_SEGMENT_GROW_CLASS, TREE_NODE_INFO_CLASS } from '@theia/core/lib/browser/tree';
import { codicon, ContextMenuRenderer, HoverService } from '@theia/core/lib/browser';
import { TimelineNode, TimelineTreeModel } from './timeline-tree-model';
import { TimelineService } from './timeline-service';
import { TimelineContextKeyService } from './timeline-context-key-service';
import * as React from '@theia/core/shared/react';
import { TimelineItem } from '../common/timeline-model';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { isThemeIcon } from '@theia/core/lib/common/theme';

export const TIMELINE_ITEM_CONTEXT_MENU: MenuPath = ['timeline-item-context-menu'];

@injectable()
export class TimelineTreeWidget extends TreeWidget {

    static ID = 'timeline-tree-widget';
    static PAGE_SIZE = 20;

    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(TimelineContextKeyService) protected readonly contextKeys: TimelineContextKeyService;
    @inject(TimelineService) protected readonly timelineService: TimelineService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(HoverService) protected readonly hoverService: HoverService;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TimelineTreeModel) override readonly model: TimelineTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = TimelineTreeWidget.ID;
        this.addClass('timeline-outer-container');
    }

    protected override renderNode(node: TimelineNode, props: NodeProps): React.ReactNode {
        const attributes = this.createNodeAttributes(node, props);
        const content = <TimelineItemNode
            timelineItem={node.timelineItem}
            commandRegistry={this.commandRegistry}
            contextKeys={this.contextKeys}
            contextMenuRenderer={this.contextMenuRenderer}
            hoverService={this.hoverService} />;
        return React.createElement('div', attributes, content);
    }

    protected override handleEnter(event: KeyboardEvent): void {
        const node = this.model.getFocusedNode() as TimelineNode;
        const command = node?.timelineItem?.command;
        if (command) {
            this.commandRegistry.executeCommand(command.id, ...(command.arguments ? command.arguments : []));
        }
    }

    protected override async handleLeft(event: KeyboardEvent): Promise<void> {
        this.model.selectPrevNode();
    }
}

export namespace TimelineItemNode {
    export interface Props {
        timelineItem: TimelineItem;
        commandRegistry: CommandRegistry;
        contextKeys: TimelineContextKeyService;
        contextMenuRenderer: ContextMenuRenderer;
        hoverService: HoverService;
    }
}

export class TimelineItemNode extends React.Component<TimelineItemNode.Props> {
    override render(): JSX.Element | undefined {
        const { label, description, tooltip, accessibilityInformation, icon } = this.props.timelineItem;

        let iconString: string = '';
        if (icon) {
            if (typeof icon === 'string') {
                iconString = codicon(icon);
            } else if (isThemeIcon(icon)) {
                iconString = codicon(icon.id);
            }
        }

        return <div className='theia-TreeNodeContent'
            onContextMenu={this.renderContextMenu}
            onClick={this.open}
            onMouseEnter={e => this.requestHover(e, tooltip)}
            aria-label={accessibilityInformation?.label}
            role={accessibilityInformation?.role}
        >
            <div className={`timeline-item noWrapInfo ${TREE_NODE_SEGMENT_GROW_CLASS} no-select`}>
                <span className={`${iconString} timeline-item-icon`} />
                <div className='noWrapInfo'>
                    <span className='timeline-item-label'>
                        {label}
                    </span>
                    <span className={`timeline-item-description ${TREE_NODE_INFO_CLASS}`}>
                        {description}
                    </span>
                </div>
            </div>
        </div >;
    }

    protected open = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const command: any = this.props.timelineItem.command;
        if (command) {
            this.props.commandRegistry.executeCommand(command.id, ...command.arguments ? command.arguments : []);
        }
    };

    protected requestHover(e: React.MouseEvent<HTMLElement, MouseEvent>, content?: string | MarkdownString): void {
        if (content) {
            this.props.hoverService.requestHover({
                content,
                target: e.currentTarget,
                position: 'right',
                interactive: MarkdownString.is(content),
            });
        }
    }

    protected renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const { timelineItem, contextKeys, contextMenuRenderer } = this.props;
        const currentTimelineItem = contextKeys.timelineItem.get();
        contextKeys.timelineItem.set(timelineItem.contextValue);
        try {
            contextMenuRenderer.render({
                menuPath: TIMELINE_ITEM_CONTEXT_MENU,
                anchor: event.nativeEvent,
                args: [timelineItem],
                context: event.currentTarget
            });
        } finally {
            contextKeys.timelineItem.set(currentTimelineItem);
        }
    };
}
