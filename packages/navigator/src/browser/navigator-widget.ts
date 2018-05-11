/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, postConstruct } from 'inversify';
import { h } from '@phosphor/virtualdom/lib';
import { Message } from '@phosphor/messaging';
import URI from '@theia/core/lib/common/uri';
import { SelectionService, CommandService } from '@theia/core/lib/common';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { ContextMenuRenderer, TreeProps, TreeModel, TreeNode, LabelProvider, Widget, SelectableTreeNode, ExpandableTreeNode } from '@theia/core/lib/browser';
import { FileTreeWidget, DirNode, FileNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService, WorkspaceCommands } from '@theia/workspace/lib/browser';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { FileNavigatorModel } from './navigator-model';
import { FileNavigatorSearch } from './navigator-search';
import { SearchBox, SearchBoxProps, SearchBoxFactory } from './search-box';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';

export const FILE_NAVIGATOR_ID = 'files';
export const LABEL = 'Files';
export const CLASS = 'theia-Files';

@injectable()
export class FileNavigatorWidget extends FileTreeWidget {

    protected readonly searchBox: SearchBox;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileNavigatorModel) readonly model: FileNavigatorModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer,
        @inject(CommandService) protected readonly commandService: CommandService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(LabelProvider) protected readonly labelProvider: LabelProvider,
        @inject(FileNavigatorSearch) protected readonly navigatorSearch: FileNavigatorSearch,
        @inject(SearchBoxFactory) protected readonly searchBoxFactory: SearchBoxFactory,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        super(props, model, contextMenuRenderer);
        this.id = FILE_NAVIGATOR_ID;
        this.title.label = LABEL;
        this.addClass(CLASS);
        this.initialize();
        this.searchBox = searchBoxFactory(SearchBoxProps.DEFAULT);
    }

    @postConstruct()
    protected init(): void {
        super.init();
        this.toDispose.pushAll([
            this.searchBox,
            this.searchBox.onTextChange(data => this.navigatorSearch.filter(data)),
            this.searchBox.onClose(data => this.navigatorSearch.filter(undefined)),
            this.searchBox.onNext(() => this.model.selectNextNode()),
            this.searchBox.onPrevious(() => this.model.selectPrevNode()), this.navigatorSearch,
            this.navigatorSearch,
            this.navigatorSearch.onFilteredNodesChanged(nodes => {
                const node = nodes.find(SelectableTreeNode.is);
                if (node) {
                    this.model.selectNode(node);
                }
            }),
            this.model.onSelectionChanged(selection => {
                if (this.shell.activeWidget === this) {
                    this.selectionService.selection = selection;
                }
            }),
            this.model.onExpansionChanged(node => {
                this.searchBox.hide();
                if (node.expanded && node.children.length === 1) {
                    const child = node.children[0];
                    if (ExpandableTreeNode.is(child) && !child.expanded) {
                        this.model.expandNode(child);
                    }
                }
            })
        ]);
    }

    protected initialize(): void {
        this.workspaceService.root.then(async resolvedRoot => {
            if (resolvedRoot) {
                const uri = new URI(resolvedRoot.uri);
                const label = this.labelProvider.getName(uri);
                const icon = await this.labelProvider.getIcon(resolvedRoot);
                this.model.root = DirNode.createRoot(resolvedRoot, label, icon);
            } else {
                this.update();
            }
        });
    }

    protected enableDndOnMainPanel(): void {
        const mainPanelNode = this.shell.mainPanel.node;
        this.addEventListener(mainPanelNode, 'drop', async e => {
            const treeNode = this.getTreeNodeFromData(e.dataTransfer);

            if (FileNode.is(treeNode)) {
                this.commandService.executeCommand(CommonCommands.OPEN.id, treeNode.uri);
            }
        });
        const handler = (e: DragEvent) => {
            e.dataTransfer.dropEffect = 'link';
            e.preventDefault();
        };
        this.addEventListener(mainPanelNode, 'dragover', handler);
        this.addEventListener(mainPanelNode, 'dragenter', handler);
    }

    protected deflateForStorage(node: TreeNode): object {
        // tslint:disable-next-line:no-any
        const copy = { ...node } as any;
        if (copy.uri) {
            copy.uri = copy.uri.toString();
        }
        return super.deflateForStorage(copy);
    }

    // tslint:disable-next-line:no-any
    protected inflateFromStorage(node: any, parent?: TreeNode): TreeNode {
        if (node.uri) {
            node.uri = new URI(node.uri);
        }
        return super.inflateFromStorage(node, parent);
    }

    protected renderTree(model: TreeModel): h.Child {
        return super.renderTree(model) || this.renderOpenWorkspaceDiv();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addClipboardListener(this.node, 'copy', e => this.handleCopy(e));
        this.addClipboardListener(this.node, 'paste', e => this.handlePaste(e));
        if (this.searchBox.isAttached) {
            Widget.detach(this.searchBox);
        }
        Widget.attach(this.searchBox, this.node.parentElement!);
        this.addKeyListener(this.node, this.searchBox.keyCodePredicate.bind(this.searchBox), this.searchBox.handle.bind(this.searchBox));
        this.enableDndOnMainPanel();
    }

    protected handleCopy(event: ClipboardEvent): void {
        const uris = this.model.selectedFileStatNodes.map(node => node.uri.toString());
        if (uris.length > 0) {
            event.clipboardData.setData('text/plain', uris.join('\n'));
            event.preventDefault();
        }
    }

    protected handlePaste(event: ClipboardEvent): void {
        const raw = event.clipboardData.getData('text/plain');
        if (!raw) {
            return;
        }
        const uri = new URI(raw);
        if (this.model.copy(uri)) {
            event.preventDefault();
        }
    }

    /**
     * Instead of rendering the file resources form the workspace, we render a placeholder
     * button when the workspace root is not yet set.
     */
    protected renderOpenWorkspaceDiv(): h.Child {
        const button = h.button({
            className: 'open-workspace-button',
            title: 'Select a directory as your workspace root',
            onclick: e => this.commandService.executeCommand(WorkspaceCommands.OPEN.id)
        }, 'Open Workspace');
        const buttonContainer = h.div({ className: 'open-workspace-button-container' }, button);
        return h.div({ className: 'theia-navigator-container' }, 'You have not yet opened a workspace.', buttonContainer);
    }

}
