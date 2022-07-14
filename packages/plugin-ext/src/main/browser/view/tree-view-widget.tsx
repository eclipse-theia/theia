// *****************************************************************************
// Copyright (C) 2018-2019 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { URI } from '@theia/core/shared/vscode-uri';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { TreeViewsExt, TreeViewItemCollapsibleState, TreeViewItem, TreeViewSelection, ThemeIcon } from '../../../common/plugin-api-rpc';
import { Command } from '../../../common/plugin-api-rpc-model';
import {
    TreeNode,
    NodeProps,
    SelectableTreeNode,
    ExpandableTreeNode,
    CompositeTreeNode,
    TreeImpl,
    TREE_NODE_SEGMENT_CLASS,
    TREE_NODE_SEGMENT_GROW_CLASS,
    TREE_NODE_TAIL_CLASS,
    TreeModelImpl,
    TreeViewWelcomeWidget,
    TooltipService,
    TooltipAttributes
} from '@theia/core/lib/browser';
import { MenuPath, MenuModelRegistry, ActionMenuNode } from '@theia/core/lib/common/menu';
import * as React from '@theia/core/shared/react';
import { PluginSharedStyle } from '../plugin-shared-style';
import { ACTION_ITEM, codicon, Widget } from '@theia/core/lib/browser/widgets/widget';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { MessageService } from '@theia/core/lib/common/message-service';
import { View } from '../../../common/plugin-protocol';
import CoreURI from '@theia/core/lib/common/uri';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import * as markdownit from '@theia/core/shared/markdown-it';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { AccessibilityInformation } from '@theia/plugin';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { DecoratedTreeNode } from '@theia/core/lib/browser/tree/tree-decorator';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';

export const TREE_NODE_HYPERLINK = 'theia-TreeNodeHyperlink';
export const VIEW_ITEM_CONTEXT_MENU: MenuPath = ['view-item-context-menu'];
export const VIEW_ITEM_INLINE_MENU: MenuPath = ['view-item-inline-menu'];

export interface SelectionEventHandler {
    readonly node: SelectableTreeNode;
    readonly contextSelection: boolean;
}

export interface TreeViewNode extends SelectableTreeNode, DecoratedTreeNode {
    contextValue?: string;
    command?: Command;
    resourceUri?: string;
    themeIcon?: ThemeIcon;
    tooltip?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    description?: string | boolean | any;
    accessibilityInformation?: AccessibilityInformation;
}
export namespace TreeViewNode {
    export function is(arg: TreeNode | undefined): arg is TreeViewNode {
        return !!arg && SelectableTreeNode.is(arg) && DecoratedTreeNode.is(arg);
    }
}

export interface CompositeTreeViewNode extends TreeViewNode, ExpandableTreeNode, CompositeTreeNode {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    description?: string | boolean | any;
}
export namespace CompositeTreeViewNode {
    export function is(arg: TreeNode | undefined): arg is CompositeTreeViewNode {
        return TreeViewNode.is(arg) && ExpandableTreeNode.is(arg) && CompositeTreeNode.is(arg);
    }
}

@injectable()
export class TreeViewWidgetIdentifier {
    id: string;
}

@injectable()
export class PluginTree extends TreeImpl {

    @inject(PluginSharedStyle)
    protected readonly sharedStyle: PluginSharedStyle;

    @inject(TreeViewWidgetIdentifier)
    protected readonly identifier: TreeViewWidgetIdentifier;

    @inject(MessageService)
    protected readonly notification: MessageService;

    protected readonly onDidChangeWelcomeStateEmitter: Emitter<void> = new Emitter<void>();
    readonly onDidChangeWelcomeState = this.onDidChangeWelcomeStateEmitter.event;

    private _proxy: TreeViewsExt | undefined;
    private _viewInfo: View | undefined;
    private _isEmpty: boolean;

    set proxy(proxy: TreeViewsExt | undefined) {
        this._proxy = proxy;
    }
    get proxy(): TreeViewsExt | undefined {
        return this._proxy;
    }

    set viewInfo(viewInfo: View) {
        this._viewInfo = viewInfo;
    }

    get isEmpty(): boolean {
        return this._isEmpty;
    }

    protected override async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (!this._proxy) {
            return super.resolveChildren(parent);
        }
        const children = await this.fetchChildren(this._proxy, parent);
        return children.map(value => this.createTreeNode(value, parent));
    }

    protected async fetchChildren(proxy: TreeViewsExt, parent: CompositeTreeNode): Promise<TreeViewItem[]> {
        try {
            const children = await proxy.$getChildren(this.identifier.id, parent.id);
            const oldEmpty = this._isEmpty;
            this._isEmpty = !parent.id && (!children || children.length === 0);
            if (oldEmpty !== this._isEmpty) {
                this.onDidChangeWelcomeStateEmitter.fire();
            }
            return children || [];
        } catch (e) {
            if (e) {
                console.error(`Failed to fetch children for '${this.identifier.id}'`, e);
                const label = this._viewInfo ? this._viewInfo.name : this.identifier.id;
                this.notification.error(`${label}: ${e.message}`);
            }
            return [];
        }
    }

    protected createTreeNode(item: TreeViewItem, parent: CompositeTreeNode): TreeNode {
        const decorationData = this.toDecorationData(item);
        const icon = this.toIconClass(item);
        const resourceUri = item.resourceUri && URI.revive(item.resourceUri).toString();
        const themeIcon = item.themeIcon ? item.themeIcon : item.collapsibleState !== TreeViewItemCollapsibleState.None ? { id: 'folder' } : undefined;
        const update: Partial<TreeViewNode> = {
            name: item.label,
            decorationData,
            icon,
            description: item.description,
            themeIcon,
            resourceUri,
            tooltip: item.tooltip,
            contextValue: item.contextValue,
            command: item.command,
            accessibilityInformation: item.accessibilityInformation,
        };
        const node = this.getNode(item.id);
        if (item.collapsibleState !== undefined && item.collapsibleState !== TreeViewItemCollapsibleState.None) {
            if (CompositeTreeViewNode.is(node)) {
                return Object.assign(node, update);
            }
            return Object.assign({
                id: item.id,
                parent,
                visible: true,
                selected: false,
                expanded: TreeViewItemCollapsibleState.Expanded === item.collapsibleState,
                children: [],
                command: item.command
            }, update);
        }
        if (TreeViewNode.is(node) && !ExpandableTreeNode.is(node)) {
            return Object.assign(node, update, { command: item.command });
        }
        return Object.assign({
            id: item.id,
            parent,
            visible: true,
            selected: false,
            command: item.command,
        }, update);
    }

    protected toDecorationData(item: TreeViewItem): WidgetDecoration.Data {
        let decoration: WidgetDecoration.Data = {};
        if (item.highlights) {
            const highlight = {
                ranges: item.highlights.map(h => ({ offset: h[0], length: h[1] - h[0] }))
            };
            decoration = { highlight };
        }
        return decoration;
    }

    protected toIconClass(item: TreeViewItem): string | undefined {
        if (item.icon) {
            return 'fa ' + item.icon;
        }
        if (item.iconUrl) {
            const reference = this.sharedStyle.toIconClass(item.iconUrl);
            this.toDispose.push(reference);
            return reference.object.iconClass;
        }
        return undefined;
    }

}

@injectable()
export class PluginTreeModel extends TreeModelImpl {

    @inject(PluginTree)
    protected override readonly tree: PluginTree;

    set proxy(proxy: TreeViewsExt | undefined) {
        this.tree.proxy = proxy;
    }
    get proxy(): TreeViewsExt | undefined {
        return this.tree.proxy;
    }

    set viewInfo(viewInfo: View) {
        this.tree.viewInfo = viewInfo;
    }

    get isTreeEmpty(): boolean {
        return this.tree.isEmpty;
    }

    get onDidChangeWelcomeState(): Event<void> {
        return this.tree.onDidChangeWelcomeState;
    }

}

@injectable()
export class TreeViewWidget extends TreeViewWelcomeWidget {

    protected _contextSelection = false;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    @inject(TreeViewWidgetIdentifier)
    readonly identifier: TreeViewWidgetIdentifier;

    @inject(PluginTreeModel)
    override readonly model: PluginTreeModel;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(TooltipService)
    protected readonly tooltipService: TooltipService;

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    @inject(ColorRegistry)
    protected readonly colorRegistry: ColorRegistry;

    protected readonly markdownIt = markdownit();

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = this.identifier.id;
        this.addClass('theia-tree-view');
        this.node.style.height = '100%';
        this.markdownItPlugin();
        this.model.onDidChangeWelcomeState(this.update, this);
        this.toDispose.push(this.model.onDidChangeWelcomeState(this.update, this));
        this.toDispose.push(this.onDidChangeVisibilityEmitter);
    }

    protected markdownItPlugin(): void {
        this.markdownIt.renderer.rules.text = (tokens, idx) => {
            const content = tokens[idx].content;
            return this.labelParser.parse(content).map(chunk => {
                if (typeof chunk === 'string') {
                    return chunk;
                }
                return `<i class="${codicon(chunk.name)} ${chunk.animation ? `fa-${chunk.animation}` : ''} icon-inline"></i>`;
            }).join('');
        };
    }

    protected override renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        const icon = this.toNodeIcon(node);
        if (icon) {
            let style: React.CSSProperties | undefined;
            if (TreeViewNode.is(node) && node.themeIcon?.color) {
                const color = this.colorRegistry.getCurrentColor(node.themeIcon.color.id);
                if (color) {
                    style = { color };
                }
            }
            return <div className={icon + ' theia-tree-view-icon'} style={style}></div>;
        }
        return undefined;
    }

    protected override renderCaption(node: TreeViewNode, props: NodeProps): React.ReactNode {
        const classes = [TREE_NODE_SEGMENT_CLASS];
        if (!this.hasTrailingSuffixes(node)) {
            classes.push(TREE_NODE_SEGMENT_GROW_CLASS);
        }
        const className = classes.join(' ');

        let attrs: React.HTMLAttributes<HTMLElement> & Partial<TooltipAttributes> = {
            ...this.decorateCaption(node, {}),
            className,
            id: node.id
        };

        if (node.accessibilityInformation) {
            attrs = {
                ...attrs,
                'aria-label': node.accessibilityInformation.label,
                'role': node.accessibilityInformation.role
            };
        }

        if (node.tooltip && MarkdownString.is(node.tooltip)) {
            // Render markdown in custom tooltip
            const tooltip = this.markdownIt.render(node.tooltip.value);

            attrs = {
                ...attrs,
                'data-tip': tooltip,
                'data-for': this.tooltipService.tooltipId
            };
        } else {
            const title = node.tooltip ||
                (node.resourceUri && this.labelProvider.getLongName(new CoreURI(node.resourceUri)))
                || this.toNodeName(node);

            attrs = {
                ...attrs,
                title
            };
        }

        const children: React.ReactNode[] = [];
        const caption = this.toNodeName(node);
        const highlight = this.getDecorationData(node, 'highlight')[0];
        if (highlight) {
            children.push(this.toReactNode(caption, highlight));
        }
        const searchHighlight = this.searchHighlights && this.searchHighlights.get(node.id);
        if (searchHighlight) {
            children.push(...this.toReactNode(caption, searchHighlight));
        } else if (!highlight) {
            children.push(caption);
        }
        const description = this.toNodeDescription(node);
        if (description) {
            children.push(<span className='theia-tree-view-description'>{description}</span>);
        }
        return React.createElement('div', attrs, ...children);
    }

    protected override renderTailDecorations(node: TreeViewNode, props: NodeProps): React.ReactNode {
        return this.contextKeys.with({ view: this.id, viewItem: node.contextValue }, () => {
            const menu = this.menus.getMenu(VIEW_ITEM_INLINE_MENU);
            const arg = this.toTreeViewSelection(node);
            const inlineCommands = menu.children.filter((item): item is ActionMenuNode => item instanceof ActionMenuNode);
            const tailDecorations = super.renderTailDecorations(node, props);
            return <React.Fragment>
                {inlineCommands.length > 0 && <div className={TREE_NODE_SEGMENT_CLASS + ' flex'}>
                    {inlineCommands.map((item, index) => this.renderInlineCommand(item, index, this.focusService.hasFocus(node), arg))}
                </div>}
                {tailDecorations !== undefined && <div className={TREE_NODE_SEGMENT_CLASS + ' flex'}>{tailDecorations}</div>}
            </React.Fragment>;
        });
    }

    toTreeViewSelection(node: TreeNode): TreeViewSelection {
        return { treeViewId: this.id, treeItemId: node.id };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected renderInlineCommand(node: ActionMenuNode, index: number, tabbable: boolean, arg: any): React.ReactNode {
        const { icon } = node;
        if (!icon || !this.commands.isVisible(node.command, arg) || !node.when || !this.contextKeys.match(node.when)) {
            return false;
        }
        const className = [TREE_NODE_SEGMENT_CLASS, TREE_NODE_TAIL_CLASS, icon, ACTION_ITEM, 'theia-tree-view-inline-action'].join(' ');
        const tabIndex = tabbable ? 0 : undefined;
        return <div key={index} className={className} title={node.label} tabIndex={tabIndex} onClick={e => {
            e.stopPropagation();
            this.commands.executeCommand(node.command, arg);
        }} />;
    }

    protected override toContextMenuArgs(node: SelectableTreeNode): [TreeViewSelection] {
        return [this.toTreeViewSelection(node)];
    }

    override setFlag(flag: Widget.Flag): void {
        super.setFlag(flag);
        if (flag === Widget.Flag.IsVisible) {
            this.onDidChangeVisibilityEmitter.fire(this.isVisible);
        }
    }

    override clearFlag(flag: Widget.Flag): void {
        super.clearFlag(flag);
        if (flag === Widget.Flag.IsVisible) {
            this.onDidChangeVisibilityEmitter.fire(this.isVisible);
        }
    }

    override handleEnter(event: KeyboardEvent): void {
        super.handleEnter(event);
        this.tryExecuteCommand();
    }

    protected override tapNode(node?: TreeNode): void {
        super.tapNode(node);
        const commandMap = this.findCommands(node);
        if (commandMap.size > 0) {
            this.tryExecuteCommandMap(commandMap);
        } else if (node && this.isExpandable(node)) {
            this.model.toggleNodeExpansion(node);
        }
    }

    // execute TreeItem.command if present
    protected tryExecuteCommand(node?: TreeNode): void {
        this.tryExecuteCommandMap(this.findCommands(node));
    }

    protected tryExecuteCommandMap(commandMap: Map<string, unknown[]>): void {
        commandMap.forEach((args, commandId) => {
            this.commands.executeCommand(commandId, ...args);
        });
    }

    protected findCommands(node?: TreeNode): Map<string, unknown[]> {
        const commandMap = new Map<string, unknown[]>();
        const treeNodes = (node ? [node] : this.model.selectedNodes) as TreeViewNode[];
        for (const treeNode of treeNodes) {
            if (treeNode && treeNode.command) {
                commandMap.set(treeNode.command.id, treeNode.command.arguments || []);
            }
        }
        return commandMap;
    }

    private _message: string | undefined;
    get message(): string | undefined {
        return this._message;
    }

    set message(message: string | undefined) {
        this._message = message;
        this.update();
    }

    protected override render(): React.ReactNode {
        const node = React.createElement('div', this.createContainerAttributes(), this.renderSearchInfo(), this.renderTree(this.model));
        this.tooltipService.update();
        return node;
    }

    protected renderSearchInfo(): React.ReactNode {
        if (this._message) {
            return <div className='theia-TreeViewInfo'>{this._message}</div>;
        }
        return undefined;
    }

    override shouldShowWelcomeView(): boolean {
        return (this.model.proxy === undefined || this.model.isTreeEmpty) && this.message === undefined;
    }
}
