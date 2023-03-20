// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import * as React from '@theia/core/shared/react';
import { injectable, interfaces, Container, postConstruct, inject } from '@theia/core/shared/inversify';
import {
    ApplicationShell,
    codicon,
    ContextMenuRenderer,
    defaultTreeProps,
    NavigatableWidget,
    NodeProps,
    Saveable,
    TabBar,
    TreeDecoration,
    TreeDecoratorService,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
    TREE_NODE_CONTENT_CLASS,
    Widget,
} from '@theia/core/lib/browser';
import { OpenEditorNode, OpenEditorsModel } from './navigator-open-editors-tree-model';
import { createFileTreeContainer, FileTreeModel, FileTreeWidget } from '@theia/filesystem/lib/browser';
import { OpenEditorsTreeDecoratorService } from './navigator-open-editors-decorator-service';
import { OPEN_EDITORS_CONTEXT_MENU } from './navigator-open-editors-menus';
import { CommandService } from '@theia/core/lib/common';
import { OpenEditorsCommands } from './navigator-open-editors-commands';
import { nls } from '@theia/core/lib/common/nls';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AbstractNavigatorTreeWidget } from '../abstract-navigator-tree-widget';

export const OPEN_EDITORS_PROPS: TreeProps = {
    ...defaultTreeProps,
    virtualized: false,
    contextMenuPath: OPEN_EDITORS_CONTEXT_MENU,
    leftPadding: 22
};

export interface OpenEditorsNodeRow extends TreeWidget.NodeRow {
    node: OpenEditorNode;
}
@injectable()
export class OpenEditorsWidget extends AbstractNavigatorTreeWidget {
    static ID = 'theia-open-editors-widget';
    static LABEL = nls.localizeByDefault('Open Editors');

    @inject(ApplicationShell) protected readonly applicationShell: ApplicationShell;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    static createContainer(parent: interfaces.Container): Container {
        const child = createFileTreeContainer(parent);

        child.unbind(FileTreeModel);
        child.bind(OpenEditorsModel).toSelf();
        child.rebind(TreeModel).toService(OpenEditorsModel);

        child.unbind(FileTreeWidget);
        child.bind(OpenEditorsWidget).toSelf();

        child.rebind(TreeProps).toConstantValue(OPEN_EDITORS_PROPS);

        child.bind(OpenEditorsTreeDecoratorService).toSelf().inSingletonScope();
        child.rebind(TreeDecoratorService).toService(OpenEditorsTreeDecoratorService);
        return child;
    }

    static createWidget(parent: interfaces.Container): OpenEditorsWidget {
        return OpenEditorsWidget.createContainer(parent).get(OpenEditorsWidget);
    }

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(OpenEditorsModel) override readonly model: OpenEditorsModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
    }

    @postConstruct()
    override init(): void {
        super.init();
        this.id = OpenEditorsWidget.ID;
        this.title.label = OpenEditorsWidget.LABEL;
        this.addClass(OpenEditorsWidget.ID);
        this.update();
    }

    get editorWidgets(): NavigatableWidget[] {
        return this.model.editorWidgets;
    }

    // eslint-disable-next-line no-null/no-null
    protected activeTreeNodePrefixElement: string | undefined | null;

    protected override renderNode(node: OpenEditorNode, props: NodeProps): React.ReactNode {
        if (!TreeNode.isVisible(node)) {
            return undefined;
        }
        const attributes = this.createNodeAttributes(node, props);
        const isEditorNode = !(node.id.startsWith(OpenEditorsModel.GROUP_NODE_ID_PREFIX) || node.id.startsWith(OpenEditorsModel.AREA_NODE_ID_PREFIX));
        const content = <div className={`${TREE_NODE_CONTENT_CLASS}`}>
            {this.renderExpansionToggle(node, props)}
            {isEditorNode && this.renderPrefixIcon(node)}
            {this.decorateIcon(node, this.renderIcon(node, props))}
            {this.renderCaptionAffixes(node, props, 'captionPrefixes')}
            {this.renderCaption(node, props)}
            {this.renderCaptionAffixes(node, props, 'captionSuffixes')}
            {this.renderTailDecorations(node, props)}
            {(this.isGroupNode(node) || this.isAreaNode(node)) && this.renderInteractables(node, props)}
        </div>;
        return React.createElement('div', attributes, content);
    }

    protected override getDecorationData<K extends keyof TreeDecoration.Data>(node: TreeNode, key: K): Required<Pick<TreeDecoration.Data, K>>[K][] {
        const contributed = super.getDecorationData(node, key);
        if (key === 'captionSuffixes' && OpenEditorNode.is(node)) {
            (contributed as Array<Array<TreeDecoration.CaptionAffix>>).push(this.getWorkspaceDecoration(node));
        }
        return contributed;
    }

    protected getWorkspaceDecoration(node: OpenEditorNode): TreeDecoration.CaptionAffix[] {
        const color = this.getDecorationData(node, 'fontData').find(data => data.color)?.color;
        return [{
            fontData: { color },
            data: this.labelProvider.getDetails(node.fileStat),
        }];
    }

    protected isGroupNode(node: OpenEditorNode): boolean {
        return node.id.startsWith(OpenEditorsModel.GROUP_NODE_ID_PREFIX);
    }

    protected isAreaNode(node: OpenEditorNode): boolean {
        return node.id.startsWith(OpenEditorsModel.AREA_NODE_ID_PREFIX);
    }

    protected override doRenderNodeRow({ node, depth }: OpenEditorsNodeRow): React.ReactNode {
        let groupClass = '';
        if (this.isGroupNode(node)) {
            groupClass = 'group-node';
        } else if (this.isAreaNode(node)) {
            groupClass = 'area-node';
        }
        return <div className={`open-editors-node-row ${this.getPrefixIconClass(node)}${groupClass}`}>
            {this.renderNode(node, { depth })}
        </div>;
    }

    protected renderInteractables(node: OpenEditorNode, props: NodeProps): React.ReactNode {
        return (<div className='open-editors-inline-actions-container'>
            <div className='open-editors-inline-action'>
                <a className='codicon codicon-save-all'
                    title={OpenEditorsCommands.SAVE_ALL_IN_GROUP_FROM_ICON.label}
                    onClick={this.handleGroupActionIconClicked}
                    data-id={node.id}
                    id={OpenEditorsCommands.SAVE_ALL_IN_GROUP_FROM_ICON.id}
                />
            </div>
            <div className='open-editors-inline-action' >
                <a className='codicon codicon-close-all'
                    title={OpenEditorsCommands.CLOSE_ALL_EDITORS_IN_GROUP_FROM_ICON.label}
                    onClick={this.handleGroupActionIconClicked}
                    data-id={node.id}
                    id={OpenEditorsCommands.CLOSE_ALL_EDITORS_IN_GROUP_FROM_ICON.id}
                />
            </div>
        </div>
        );
    }

    protected handleGroupActionIconClicked = async (e: React.MouseEvent<HTMLAnchorElement>) => this.doHandleGroupActionIconClicked(e);
    protected async doHandleGroupActionIconClicked(e: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
        e.stopPropagation();
        const groupName = e.currentTarget.getAttribute('data-id');
        const command = e.currentTarget.id;
        if (groupName && command) {
            const groupFromTarget: string | number | undefined = groupName.split(':').pop();
            const areaOrTabBar = this.sanitizeInputFromClickHandler(groupFromTarget);
            if (areaOrTabBar) {
                return this.commandService.executeCommand(command, areaOrTabBar);
            }
        }
    }

    protected sanitizeInputFromClickHandler(groupFromTarget?: string): ApplicationShell.Area | TabBar<Widget> | undefined {
        let areaOrTabBar: ApplicationShell.Area | TabBar<Widget> | undefined;
        if (groupFromTarget) {
            if (ApplicationShell.isValidArea(groupFromTarget)) {
                areaOrTabBar = groupFromTarget;
            } else {
                const groupAsNum = parseInt(groupFromTarget);
                if (!isNaN(groupAsNum)) {
                    areaOrTabBar = this.model.getTabBarForGroup(groupAsNum);
                }
            }
        }
        return areaOrTabBar;
    }

    protected renderPrefixIcon(node: OpenEditorNode): React.ReactNode {
        return (
            <div className='open-editors-prefix-icon-container'>
                <div data-id={node.id}
                    className={`open-editors-prefix-icon dirty ${codicon('circle-filled', true)}`}
                />
                <div data-id={node.id}
                    onClick={this.closeEditor}
                    className={`open-editors-prefix-icon close ${codicon('close', true)}`}
                />
            </div>);
    }

    protected getPrefixIconClass(node: OpenEditorNode): string {
        const saveable = Saveable.get(node.widget);
        if (saveable) {
            return saveable.dirty ? 'dirty' : '';
        }
        return '';
    }

    protected closeEditor = async (e: React.MouseEvent<HTMLDivElement>) => this.doCloseEditor(e);
    protected async doCloseEditor(e: React.MouseEvent<HTMLDivElement>): Promise<void> {
        const widgetId = e.currentTarget.getAttribute('data-id');
        if (widgetId) {
            await this.applicationShell.closeWidget(widgetId);
        }
    }

    protected override tapNode(node?: TreeNode): void {
        if (OpenEditorNode.is(node)) {
            this.applicationShell.activateWidget(node.widget.id);
        }
        super.tapNode(node);
    }

    protected override handleContextMenuEvent(node: OpenEditorNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        super.handleContextMenuEvent(node, event);
        if (node) {
            // Since the CommonCommands used in the context menu act on the shell's activeWidget, this is necessary to ensure
            // that the EditorWidget is activated, not the Navigator itself
            this.applicationShell.activateWidget(node.widget.id);
        }
    }

    protected override getPaddingLeft(node: TreeNode): number {
        if (node.id.startsWith(OpenEditorsModel.AREA_NODE_ID_PREFIX)) {
            return 0;
        }
        return this.props.leftPadding;
    }

    // The state of this widget is derived from external factors. No need to store or restore it.
    override storeState(): object { return {}; }
    override restoreState(): void { }
}
