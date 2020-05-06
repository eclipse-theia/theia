/********************************************************************************
 * Copyright (C) 2020 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable no-null/no-null, @typescript-eslint/no-explicit-any */

import * as React from 'react';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { isOSX } from '@theia/core/lib/common/os';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import { Message } from '@phosphor/messaging';
import { TreeWidget, TreeNode, SelectableTreeNode, TreeProps, NodeProps, TREE_NODE_SEGMENT_CLASS, TREE_NODE_SEGMENT_GROW_CLASS } from '@theia/core/lib/browser/tree';
import { ScmTreeModel } from './scm-tree-model';
import { MenuModelRegistry, ActionMenuNode, CompositeMenuNode, MenuPath } from '@theia/core/lib/common/menu';
import { ScmResourceGroup, ScmResource, ScmResourceDecorations } from './scm-provider';
import { ScmService } from './scm-service';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ScmRepository } from './scm-repository';
import { ContextMenuRenderer, LabelProvider, CorePreferences, DiffUris } from '@theia/core/lib/browser';
import { ScmContextKeyService } from './scm-context-key-service';
import { EditorWidget } from '@theia/editor/lib/browser';
import { EditorManager, DiffNavigatorProvider } from '@theia/editor/lib/browser';
import { FileStat } from '@theia/filesystem/lib/common';
import { IconThemeService } from '@theia/core/lib/browser/icon-theme-service';
import { ScmFileChangeGroupNode, ScmFileChangeFolderNode, ScmFileChangeNode } from './scm-tree-model';

@injectable()
export class ScmTreeWidget extends TreeWidget {

    static ID = 'scm-resource-widget';

    static RESOURCE_GROUP_CONTEXT_MENU = ['RESOURCE_GROUP_CONTEXT_MENU'];
    static RESOURCE_GROUP_INLINE_MENU = ['RESOURCE_GROUP_INLINE_MENU'];

    static RESOURCE_FOLDER_CONTEXT_MENU = ['RESOURCE_FOLDER_CONTEXT_MENU'];
    static RESOURCE_FOLDER_INLINE_MENU = ['RESOURCE_FOLDER_INLINE_MENU'];

    static RESOURCE_INLINE_MENU = ['RESOURCE_INLINE_MENU'];
    static RESOURCE_CONTEXT_MENU = ['RESOURCE_CONTEXT_MENU'];

    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(CorePreferences) protected readonly corePreferences: CorePreferences;
    @inject(ScmContextKeyService) protected readonly contextKeys: ScmContextKeyService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(DiffNavigatorProvider) protected readonly diffNavigatorProvider: DiffNavigatorProvider;
    @inject(IconThemeService) protected readonly iconThemeService: IconThemeService;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(ScmTreeModel) readonly model: ScmTreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
        @inject(ScmService) protected readonly scmService: ScmService,
    ) {
        super(props, model, contextMenuRenderer);
        this.id = ScmTreeWidget.ID;
        this.addClass('groups-outer-container');
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.refreshOnRepositoryChange();
        this.toDisposeOnDetach.push(this.scmService.onDidChangeSelectedRepository(() => {
            this.refreshOnRepositoryChange();
            this.forceUpdate();
        }));
    }

    set viewMode(id: 'tree' | 'list') {
        this.model.viewMode = id;
    }
    get viewMode(): 'tree' | 'list' {
        return this.model.viewMode;
    }

    protected refreshOnRepositoryChange(): void {
        const repository = this.scmService.selectedRepository;
        this.model.repository = repository;
        if (repository) {
            this.contextKeys.scmProvider.set(repository.provider.id);
        } else {
            this.contextKeys.scmProvider.reset();
        }
    }

    /**
     * Render the node given the tree node and node properties.
     * @param node the tree node.
     * @param props the node properties.
     */
    protected renderNode(node: TreeNode, props: NodeProps): React.ReactNode {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return undefined;
        }

        if (!TreeNode.isVisible(node)) {
            return undefined;
        }

        const attributes = this.createNodeAttributes(node, props);

        if (ScmFileChangeGroupNode.is(node)) {
            const content = <ScmResourceGroupElement
                key={`${node.groupId}`}
                repository={repository}
                groupId={node.groupId}
                groupLabel={node.groupLabel}
                renderExpansionToggle={() => this.renderExpansionToggle(node, props)}
                contextMenuRenderer={this.contextMenuRenderer}
                commands={this.commands}
                menus={this.menus}
                contextKeys={this.contextKeys}
                labelProvider={this.labelProvider}
                corePreferences={this.corePreferences} />;

            return React.createElement('div', attributes, content);

        }
        if (ScmFileChangeFolderNode.is(node)) {
            const content = <ScmResourceFolderElement
                key={String(node.sourceUri)}
                repository={repository}
                groupId={node.groupId}
                path={node.path}
                node={node}
                sourceUri={node.sourceUri}
                renderExpansionToggle={() => this.renderExpansionToggle(node, props)}
                contextMenuRenderer={this.contextMenuRenderer}
                model={this.model}
                commands={this.commands}
                menus={this.menus}
                contextKeys={this.contextKeys}
                labelProvider={this.labelProvider}
                corePreferences={this.corePreferences} />;

            return React.createElement('div', attributes, content);
        }
        if (ScmFileChangeNode.is(node)) {
            const groupId = ScmFileChangeNode.getGroupId(node);
            const name = this.labelProvider.getName(new URI(node.sourceUri));
            const parentPath =
                (node.parent && ScmFileChangeFolderNode.is(node.parent))
                    ? new URI(node.parent.sourceUri) : new URI(repository.provider.rootUri);

            const content = <ScmResourceComponent
                key={node.sourceUri}
                repository={repository}
                contextMenuRenderer={this.contextMenuRenderer}
                model={this.model}
                commands={this.commands}
                menus={this.menus}
                contextKeys={this.contextKeys}
                labelProvider={this.labelProvider}
                corePreferences={this.corePreferences}
                {...{
                    ...this.props,
                    name,
                    parentPath,
                    groupId,
                    sourceUri: node.sourceUri,
                    decorations: node.decorations,
                    renderExpansionToggle: () => this.renderExpansionToggle(node, props),
                }}
            />;
            return React.createElement('div', attributes, content);
        }
        return super.renderNode(node, props);
    }

    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            return {
                ...super.createContainerAttributes(),
                tabIndex: 0
            };
        }
        return super.createContainerAttributes();
    }

    /**
     * The ARROW_LEFT key controls both the movement around the file tree and also
     * the movement through the change chunks within a file.
     *
     * If the selected tree node is a folder then the ARROW_LEFT key behaves exactly
     * as it does in explorer.  It collapses the tree node if the folder is expanded and
     * it moves the selection up to the parent folder if the folder is collapsed (no-op if no parent folder, as
     * group headers are not selectable).  This behavior is the default behavior implemented
     * in the TreeWidget super class.
     *
     * If the selected tree node is a file then the ARROW_LEFT key moves up through the
     * change chunks within each file.  If the selected chunk is the first chunk in the file
     * then the file selection is moved to the previous file (no-op if no previous file).
     *
     * Note that when cursoring through change chunks, the ARROW_LEFT key cannot be used to
     * move up through the parent folders of the file tree.  If users want to do this, using
     * keys only, then they must press ARROW_UP repeatedly until the selected node is the folder
     * node and then press ARROW_LEFT.
     */
    protected async handleLeft(event: KeyboardEvent): Promise<void> {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        if (this.model.selectedNodes.length === 1) {
            const selectedNode = this.model.selectedNodes[0];
            if (ScmFileChangeNode.is(selectedNode)) {
                const selectedResource = this.getResourceFromNode(selectedNode);
                if (!selectedResource) {
                    return super.handleLeft(event);
                }
                const widget = await this.openResource(selectedResource);

                if (widget) {
                    const diffNavigator = this.diffNavigatorProvider(widget.editor);
                    if (diffNavigator.canNavigate() && diffNavigator.hasPrevious()) {
                        diffNavigator.previous();
                    } else {
                        const previousNode = this.moveToPreviousFileNode();
                        if (previousNode) {
                            const previousResource = this.getResourceFromNode(previousNode);
                            if (previousResource) {
                                this.openResource(previousResource);
                            }
                        }
                    }
                    return;
                }
            }
        }
        return super.handleLeft(event);
    }

    /**
     * The ARROW_RIGHT key controls both the movement around the file tree and also
     * the movement through the change chunks within a file.
     *
     * If the selected tree node is a folder then the ARROW_RIGHT key behaves exactly
     * as it does in explorer.  It expands the tree node if the folder is collapsed and
     * it moves the selection to the first child node if the folder is expanded.
     * This behavior is the default behavior implemented
     * in the TreeWidget super class.
     *
     * If the selected tree node is a file then the ARROW_RIGHT key moves down through the
     * change chunks within each file.  If the selected chunk is the last chunk in the file
     * then the file selection is moved to the next file (no-op if no next file).
     */
    protected async handleRight(event: KeyboardEvent): Promise<void> {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        if (this.model.selectedNodes.length === 1) {
            const selectedNode = this.model.selectedNodes[0];
            if (ScmFileChangeNode.is(selectedNode)) {
                const selectedResource = this.getResourceFromNode(selectedNode);
                if (!selectedResource) {
                    return super.handleRight(event);
                }
                const widget = await this.openResource(selectedResource);

                if (widget) {
                    const diffNavigator = this.diffNavigatorProvider(widget.editor);
                    if (diffNavigator.canNavigate() && diffNavigator.hasNext()) {
                        diffNavigator.next();
                    } else {
                        const nextNode = this.moveToNextFileNode();
                        if (nextNode) {
                            const nextResource = this.getResourceFromNode(nextNode);
                            if (nextResource) {
                                this.openResource(nextResource);
                            }
                        }
                    }
                }
                return;
            }
        }
        return super.handleRight(event);
    }

    protected handleEnter(event: KeyboardEvent): void {
        if (this.model.selectedNodes.length === 1) {
            const selectedNode = this.model.selectedNodes[0];
            if (ScmFileChangeNode.is(selectedNode)) {
                const selectedResource = this.getResourceFromNode(selectedNode);
                if (selectedResource) {
                    this.openResource(selectedResource);
                }
                return;
            }
        }
        super.handleEnter(event);
    }

    protected getResourceFromNode(node: ScmFileChangeNode): ScmResource | undefined {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        const groupId = ScmFileChangeNode.getGroupId(node);
        const group = repository.provider.groups.find(g => g.id === groupId)!;
        return group.resources.find(r => String(r.sourceUri) === node.sourceUri)!;
    }

    protected moveToPreviousFileNode(): ScmFileChangeNode | undefined {
        let previousNode = this.model.getPrevSelectableNode();
        while (previousNode) {
            if (ScmFileChangeNode.is(previousNode)) {
                this.model.selectNode(previousNode);
                return previousNode;
            }
            this.model.selectNode(previousNode);
            previousNode = this.model.getPrevSelectableNode();
        };
    }

    protected moveToNextFileNode(): ScmFileChangeNode | undefined {
        let nextNode = this.model.getNextSelectableNode();
        while (nextNode) {
            if (ScmFileChangeNode.is(nextNode)) {
                this.model.selectNode(nextNode);
                return nextNode;
            }
            this.model.selectNode(nextNode);
            nextNode = this.model.getNextSelectableNode();
        };
    }

    protected async openResource(resource: ScmResource): Promise<EditorWidget | undefined> {
        try {
            await resource.open();
        } catch (e) {
            console.error('Failed to open a SCM resource', e);
            return undefined;
        }

        let standaloneEditor: EditorWidget | undefined;
        const resourcePath = resource.sourceUri.path.toString();
        for (const widget of this.editorManager.all) {
            const resourceUri = widget.getResourceUri();
            const editorResourcePath = resourceUri && resourceUri.path.toString();
            if (resourcePath === editorResourcePath) {
                if (widget.editor.uri.scheme === DiffUris.DIFF_SCHEME) {
                    // prefer diff editor
                    return widget;
                } else {
                    standaloneEditor = widget;
                }
            }
            if (widget.editor.uri.scheme === DiffUris.DIFF_SCHEME
                && String(widget.getResourceUri()) === resource.sourceUri.toString()) {
                return widget;
            }
        }
        // fallback to standalone editor
        return standaloneEditor;
    }

    protected getPaddingLeft(node: TreeNode, props: NodeProps): number {
        if (this.viewMode === 'list') {
            if (props.depth === 1) {
                return this.props.expansionTogglePadding;
            }
        }
        return super.getPaddingLeft(node, props);
    }

    protected needsExpansionTogglePadding(node: TreeNode): boolean {
        const theme = this.iconThemeService.getDefinition(this.iconThemeService.current);
        if (theme && (theme.hidesExplorerArrows || (theme.hasFileIcons && !theme.hasFolderIcons))) {
            return false;
        }
        return super.needsExpansionTogglePadding(node);
    }

}

export namespace ScmTreeWidget {
    export namespace Styles {
        export const NO_SELECT = 'no-select';
    }

    // This is an 'abstract' base interface for all the element component props.
    export interface Props {
        repository: ScmRepository;
        commands: CommandRegistry;
        menus: MenuModelRegistry;
        contextKeys: ScmContextKeyService;
        labelProvider: LabelProvider;
        contextMenuRenderer: ContextMenuRenderer;
        corePreferences?: CorePreferences;
    }
}

export abstract class ScmElement<P extends ScmElement.Props = ScmElement.Props> extends React.Component<P, ScmElement.State> {

    constructor(props: P) {
        super(props);
        this.state = {
            hover: false
        };

        const setState = this.setState.bind(this);
        this.setState = newState => {
            if (!this.toDisposeOnUnmount.disposed) {
                setState(newState);
            }
        };
    }

    protected readonly toDisposeOnUnmount = new DisposableCollection();
    componentDidMount(): void {
        this.toDisposeOnUnmount.push(Disposable.create(() => { /* mark as mounted */ }));
    }
    componentWillUnmount(): void {
        this.toDisposeOnUnmount.dispose();
    }

    protected detectHover = (element: HTMLElement | null) => {
        if (element) {
            window.requestAnimationFrame(() => {
                const hover = element.matches(':hover');
                this.setState({ hover });
            });
        }
    };
    protected showHover = () => this.setState({ hover: true });
    protected hideHover = () => this.setState({ hover: false });

    protected renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        const { groupId, contextKeys, contextMenuRenderer } = this.props;
        const currentScmResourceGroup = contextKeys.scmResourceGroup.get();
        contextKeys.scmResourceGroup.set(groupId);
        try {
            contextMenuRenderer.render({
                menuPath: this.contextMenuPath,
                anchor: event.nativeEvent,
                args: this.contextMenuArgs
            });
        } finally {
            contextKeys.scmResourceGroup.set(currentScmResourceGroup);
        }
    };

    protected getSelectionArgs(selectedNodes: Readonly<SelectableTreeNode[]>): ScmResource[] {
        const resources: ScmResource[] = [];
        for (const node of selectedNodes) {
            if (ScmFileChangeNode.is(node)) {
                const groupId = ScmFileChangeNode.getGroupId(node);
                const group = this.findGroup(this.props.repository, groupId);
                if (group) {
                    const selectedResource = group.resources.find(r => String(r.sourceUri) === node.sourceUri);
                    if (selectedResource) {
                        resources.push(selectedResource);
                    }
                }
            }
            if (ScmFileChangeFolderNode.is(node)) {
                const group = this.findGroup(this.props.repository, node.groupId);
                if (group) {
                    this.collectResources(resources, node, group);
                }
            }
        }
        // Remove duplicates which may occur if user selected folder and nested folder
        return resources.filter((item1, index) => resources.findIndex(item2 => item1.sourceUri === item2.sourceUri) === index);
    }

    protected collectResources(resources: ScmResource[], node: TreeNode, group: ScmResourceGroup): void {
        if (ScmFileChangeFolderNode.is(node)) {
            for (const child of node.children) {
                this.collectResources(resources, child, group);
            }
        } else if (ScmFileChangeNode.is(node)) {
            const resource = group.resources.find(r => String(r.sourceUri) === node.sourceUri)!;
            resources.push(resource);
        }
    }

    /*
     * Normally the group would always be expected to be found.  However if the tree is restored
     * in restoreState then the tree may be rendered before the groups have been created
     * in the provider.  The provider's groups property will be empty in such a situation.
     * We want to render the tree (as that is the point of restoreState, we can render
     * the tree in the saved state before the provider has provided status).  We therefore must
     * be prepared to render the tree without having the ScmResourceGroup or ScmResource
     * objects.
     */
    protected findGroup(repository: ScmRepository, groupId: string): ScmResourceGroup | undefined {
        return repository.provider.groups.find(g => g.id === groupId);
    }

    protected abstract get contextMenuPath(): MenuPath;
    protected abstract get contextMenuArgs(): any[];

}
export namespace ScmElement {
    export interface Props extends ScmTreeWidget.Props {
        groupId: string
        renderExpansionToggle: () => React.ReactNode
    }
    export interface State {
        hover: boolean
    }
}

export class ScmResourceComponent extends ScmElement<ScmResourceComponent.Props> {

    render(): JSX.Element | undefined {
        const { hover } = this.state;
        const { name, groupId, parentPath, sourceUri, decorations, labelProvider, commands, menus, contextKeys } = this.props;
        const resourceUri = new URI(sourceUri);

        const icon = labelProvider.getIcon(resourceUri);
        const color = decorations && decorations.color || '';
        const letter = decorations && decorations.letter || '';
        const tooltip = decorations && decorations.tooltip || '';
        const relativePath = parentPath.relative(resourceUri.parent);
        const path = relativePath ? relativePath.toString() : labelProvider.getLongName(resourceUri.parent);
        return <div key={sourceUri}
            className={`scmItem ${TREE_NODE_SEGMENT_CLASS} ${TREE_NODE_SEGMENT_GROW_CLASS}`}
            onContextMenu={this.renderContextMenu}
            onMouseEnter={this.showHover}
            onMouseLeave={this.hideHover}
            ref={this.detectHover}
            onClick={this.handleClick}
            onDoubleClick={this.handleDoubleClick} >
            <span className={icon + ' file-icon'} />
            {this.props.renderExpansionToggle()}
            <div className={`noWrapInfo ${TREE_NODE_SEGMENT_GROW_CLASS}`} >
                <span className='name'>{name}</span>
                <span className='path'>{path}</span>
            </div>
            <ScmInlineActions {...{
                hover,
                menu: menus.getMenu(ScmTreeWidget.RESOURCE_INLINE_MENU),
                args: this.contextMenuArgs,
                commands,
                contextKeys,
                groupId
            }}>
                <div title={tooltip} className='status' style={{ color }}>
                    {letter}
                </div>
            </ScmInlineActions>
        </div >;
    }

    protected open = () => {
        const group = this.findGroup(this.props.repository, this.props.groupId);
        if (group) {
            const selectedResource = group.resources.find(r => String(r.sourceUri) === this.props.sourceUri)!;
            selectedResource.open();
        }
    };

    protected readonly contextMenuPath = ScmTreeWidget.RESOURCE_CONTEXT_MENU;
    protected get contextMenuArgs(): any[] {
        if (!this.props.model.selectedNodes.some(node => ScmFileChangeNode.is(node) && node.sourceUri === this.props.sourceUri)) {
            // Clicked node is not in selection, so ignore selection and action on just clicked node
            return this.singleNodeArgs;
        } else {
            return this.getSelectionArgs(this.props.model.selectedNodes);
        }
    }
    protected get singleNodeArgs(): any[] {
        const group = this.findGroup(this.props.repository, this.props.groupId);
        if (group) {
            const selectedResource = group.resources.find(r => String(r.sourceUri) === this.props.sourceUri)!;
            return [selectedResource];
        } else {
            // Repository status not yet available. Empty args disables the action.
            return [];
        }
    }

    protected hasCtrlCmdOrShiftMask(event: TreeWidget.ModifierAwareEvent): boolean {
        const { metaKey, ctrlKey, shiftKey } = event;
        return (isOSX && metaKey) || ctrlKey || shiftKey;
    }

    /**
     * Handle the single clicking of nodes present in the widget.
     */
    protected handleClick = (event: React.MouseEvent) => {
        if (!this.hasCtrlCmdOrShiftMask(event)) {
            // Determine the behavior based on the preference value.
            const isSingle = this.props.corePreferences && this.props.corePreferences['workbench.list.openMode'] === 'singleClick';
            if (isSingle) {
                this.open();
            }
        }
    };

    /**
     * Handle the double clicking of nodes present in the widget.
     */
    protected handleDoubleClick = () => {
        // Determine the behavior based on the preference value.
        const isDouble = this.props.corePreferences && this.props.corePreferences['workbench.list.openMode'] === 'doubleClick';
        // Nodes should only be opened through double clicking if the correct preference is set.
        if (isDouble) {
            this.open();
        }
    };
}
export namespace ScmResourceComponent {
    export interface Props extends ScmElement.Props {
        name: string;
        parentPath: URI;
        sourceUri: string;
        decorations?: ScmResourceDecorations;
        model: ScmTreeModel;
    }
}

export class ScmResourceGroupElement extends ScmElement<ScmResourceGroupComponent.Props> {

    render(): JSX.Element {
        const { hover } = this.state;
        const { groupId, groupLabel, menus, commands, contextKeys } = this.props;
        return <div className={`theia-header scm-theia-header ${TREE_NODE_SEGMENT_GROW_CLASS}`}
            onContextMenu={this.renderContextMenu}
            onMouseEnter={this.showHover}
            onMouseLeave={this.hideHover}
            ref={this.detectHover}>
            {this.props.renderExpansionToggle()}
            <div className={`noWrapInfo ${TREE_NODE_SEGMENT_GROW_CLASS}`}>{groupLabel}</div>
            <ScmInlineActions {...{
                hover,
                args: this.contextMenuArgs,
                menu: menus.getMenu(ScmTreeWidget.RESOURCE_GROUP_INLINE_MENU),
                commands,
                contextKeys,
                groupId
            }}>
                {this.renderChangeCount()}
            </ScmInlineActions>
        </div>;
    }

    protected renderChangeCount(): React.ReactNode {
        const group = this.findGroup(this.props.repository, this.props.groupId);
        return <div className='notification-count-container scm-change-count'>
            <span className='notification-count'>{group ? group.resources.length : 0}</span>
        </div>;
    }

    protected readonly contextMenuPath = ScmTreeWidget.RESOURCE_GROUP_CONTEXT_MENU;
    protected get contextMenuArgs(): any[] {
        const group = this.findGroup(this.props.repository, this.props.groupId);
        if (group) {
            return [group];
        } else {
            // Repository status not yet available. Empty args disables the action.
            return [];
        }
    }
}
export namespace ScmResourceGroupComponent {
    export interface Props extends ScmElement.Props {
        groupLabel: string;
    }
}

export class ScmResourceFolderElement extends ScmElement<ScmResourceFolderElement.Props> {

    render(): JSX.Element {
        const { hover } = this.state;
        const { groupId, sourceUri, path, labelProvider, commands, menus, contextKeys } = this.props;
        const sourceFileStat: FileStat = { uri: sourceUri, isDirectory: true, lastModification: 0 };
        const icon = labelProvider.getIcon(sourceFileStat);

        return <div key={sourceUri}
            className={`scmItem  ${TREE_NODE_SEGMENT_CLASS} ${TREE_NODE_SEGMENT_GROW_CLASS} ${ScmTreeWidget.Styles.NO_SELECT}`}
            onContextMenu={this.renderContextMenu}
            onMouseEnter={this.showHover}
            onMouseLeave={this.hideHover}
            ref={this.detectHover}
        >
            {this.props.renderExpansionToggle()}
            <span className={icon + ' file-icon'} />
            <div className={`noWrapInfo ${TREE_NODE_SEGMENT_GROW_CLASS}`} >
                <span className='name'>{path}</span>
            </div>
            <ScmInlineActions {...{
                hover,
                menu: menus.getMenu(ScmTreeWidget.RESOURCE_FOLDER_INLINE_MENU),
                args: this.contextMenuArgs,
                commands,
                contextKeys,
                groupId
            }}>
            </ScmInlineActions>
        </div >;

    }

    protected readonly contextMenuPath = ScmTreeWidget.RESOURCE_FOLDER_CONTEXT_MENU;
    protected get contextMenuArgs(): any[] {
        if (!this.props.model.selectedNodes.some(node => ScmFileChangeFolderNode.is(node) && node.sourceUri === this.props.sourceUri)) {
            // Clicked node is not in selection, so ignore selection and action on just clicked node
            return this.singleNodeArgs;
        } else {
            return this.getSelectionArgs(this.props.model.selectedNodes);
        }
    }
    protected get singleNodeArgs(): any[] {
        const resources: ScmResource[] = [];
        const group = this.findGroup(this.props.repository, this.props.groupId);
        if (group) {
            this.collectResources(resources, this.props.node, group);
        }
        return resources;
    }

}

export namespace ScmResourceFolderElement {
    export interface Props extends ScmElement.Props {
        node: ScmFileChangeFolderNode;
        sourceUri: string;
        path: string;
        model: ScmTreeModel;
    }
}

export class ScmInlineActions extends React.Component<ScmInlineActions.Props> {
    render(): React.ReactNode {
        const { hover, menu, args, commands, groupId, contextKeys, children } = this.props;
        return <div className='theia-scm-inline-actions-container'>
            <div className='theia-scm-inline-actions'>
                {hover && menu.children
                    .map((node, index) => node instanceof ActionMenuNode && <ScmInlineAction key={index} {...{ node, args, commands, groupId, contextKeys }} />)}
            </div>
            {children}
        </div>;
    }
}
export namespace ScmInlineActions {
    export interface Props {
        hover: boolean;
        menu: CompositeMenuNode;
        commands: CommandRegistry;
        groupId: string;
        contextKeys: ScmContextKeyService;
        args: any[];
        children?: React.ReactNode;
    }
}

export class ScmInlineAction extends React.Component<ScmInlineAction.Props> {
    render(): React.ReactNode {
        const { node, args, commands, groupId, contextKeys } = this.props;
        const currentScmResourceGroup = contextKeys.scmResourceGroup.get();
        contextKeys.scmResourceGroup.set(groupId);
        try {
            if (!commands.isVisible(node.action.commandId, ...args) || !contextKeys.match(node.action.when)) {
                return false;
            }
            return <div className='theia-scm-inline-action'>
                <a className={node.icon} title={node.label} onClick={this.execute} />
            </div>;
        } finally {
            contextKeys.scmResourceGroup.set(currentScmResourceGroup);
        }
    }

    protected execute = (event: React.MouseEvent) => {
        event.stopPropagation();

        const { commands, node, args } = this.props;
        commands.executeCommand(node.action.commandId, ...args);
    };
}
export namespace ScmInlineAction {
    export interface Props {
        node: ActionMenuNode;
        commands: CommandRegistry;
        groupId: string;
        contextKeys: ScmContextKeyService;
        args: any[];
    }
}
