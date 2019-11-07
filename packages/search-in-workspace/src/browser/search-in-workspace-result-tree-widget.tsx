/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct } from 'inversify';
import {
    TreeWidget,
    CompositeTreeNode,
    ConfirmDialog,
    ContextMenuRenderer,
    ExpandableTreeNode,
    SelectableTreeNode,
    TreeModel,
    TreeNode,
    NodeProps,
    LabelProvider,
    TreeProps,
    TreeExpansionService,
    ApplicationShell,
    DiffUris,
    FOLDER_ICON,
    FILE_ICON
} from '@theia/core/lib/browser';
import { CancellationTokenSource, Emitter, Event } from '@theia/core';
import { EditorManager, EditorDecoration, TrackedRangeStickiness, OverviewRulerLane, EditorWidget, ReplaceOperation, EditorOpenerOptions } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileResourceResolver } from '@theia/filesystem/lib/browser';
import { SearchInWorkspaceResult, SearchInWorkspaceOptions } from '../common/search-in-workspace-interface';
import { SearchInWorkspaceService } from './search-in-workspace-service';
import { MEMORY_TEXT } from './in-memory-text-resource';
import URI from '@theia/core/lib/common/uri';
import * as React from 'react';
import { SearchInWorkspacePreferences } from './search-in-workspace-preferences';
import { ProgressService } from '@theia/core';

const ROOT_ID = 'ResultTree';

export interface SearchInWorkspaceRoot extends CompositeTreeNode {
    children: SearchInWorkspaceRootFolderNode[];
}
export namespace SearchInWorkspaceRoot {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is SearchInWorkspaceRoot {
        return CompositeTreeNode.is(node) && node.id === ROOT_ID && node.name === ROOT_ID;
    }
}
export interface SearchInWorkspaceRootFolderNode extends ExpandableTreeNode, SelectableTreeNode { // root folder node
    children: SearchInWorkspaceFileNode[];
    parent: SearchInWorkspaceRoot;
    path: string;
    folderUri: string;
}
export namespace SearchInWorkspaceRootFolderNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is SearchInWorkspaceRootFolderNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && 'path' in node && 'folderUri' in node && !('fileUri' in node);
    }
}

export interface SearchInWorkspaceFileNode extends ExpandableTreeNode, SelectableTreeNode { // file node
    children: SearchInWorkspaceResultLineNode[];
    parent: SearchInWorkspaceRootFolderNode;
    path: string;
    fileUri: string;
    icon?: string;
}
export namespace SearchInWorkspaceFileNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is SearchInWorkspaceFileNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && 'path' in node && 'fileUri' in node && !('folderUri' in node);
    }
}

export interface SearchInWorkspaceResultLineNode extends SelectableTreeNode, SearchInWorkspaceResult { // line node
    parent: SearchInWorkspaceFileNode
}
export namespace SearchInWorkspaceResultLineNode {
    // tslint:disable-next-line:no-any
    export function is(node: any): node is SearchInWorkspaceResultLineNode {
        return SelectableTreeNode.is(node) && 'line' in node && 'character' in node && 'lineText' in node;
    }
}

@injectable()
export class SearchInWorkspaceResultTreeWidget extends TreeWidget {

    protected resultTree: Map<string, SearchInWorkspaceRootFolderNode>;

    protected _showReplaceButtons = false;
    protected _replaceTerm = '';
    protected searchTerm = '';

    protected appliedDecorations = new Map<string, string[]>();

    private cancelIndicator = new CancellationTokenSource();

    protected changeEmitter = new Emitter<Map<string, SearchInWorkspaceRootFolderNode>>();
    // tslint:disable-next-line:no-any
    protected focusInputEmitter = new Emitter<any>();

    @inject(SearchInWorkspaceService) protected readonly searchService: SearchInWorkspaceService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(FileResourceResolver) protected readonly fileResourceResolver: FileResourceResolver;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(TreeExpansionService) protected readonly expansionService: TreeExpansionService;
    @inject(SearchInWorkspacePreferences) protected readonly searchInWorkspacePreferences: SearchInWorkspacePreferences;
    @inject(ProgressService) protected readonly progressService: ProgressService;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        model.root = {
            id: ROOT_ID,
            name: ROOT_ID,
            parent: undefined,
            visible: false,
            children: []
        } as SearchInWorkspaceRoot;

        this.toDispose.push(model.onSelectionChanged(nodes => {
            const node = nodes[0];
            if (SearchInWorkspaceResultLineNode.is(node)) {
                this.doOpen(node, true);
            }
        }));

        this.resultTree = new Map<string, SearchInWorkspaceRootFolderNode>();
        this.toDispose.push(model.onNodeRefreshed(() => this.changeEmitter.fire(this.resultTree)));
    }

    @postConstruct()
    protected init(): void {
        super.init();
        this.addClass('resultContainer');

        this.toDispose.push(this.changeEmitter);
        this.toDispose.push(this.focusInputEmitter);

        this.toDispose.push(this.editorManager.onActiveEditorChanged(() => {
            this.updateCurrentEditorDecorations();
        }));

        this.toDispose.push(this.searchInWorkspacePreferences.onPreferenceChanged(() => {
            this.update();
        }));
    }

    get fileNumber(): number {
        let num = 0;
        for (const rootFolderNode of this.resultTree.values()) {
            num += rootFolderNode.children.length;
        }
        return num;
    }

    set showReplaceButtons(srb: boolean) {
        this._showReplaceButtons = srb;
        this.update();
    }

    set replaceTerm(rt: string) {
        this._replaceTerm = rt;
        this.update();
    }

    get onChange(): Event<Map<string, SearchInWorkspaceRootFolderNode>> {
        return this.changeEmitter.event;
    }

    get onFocusInput(): Event<void> {
        return this.focusInputEmitter.event;
    }

    collapseAll(): void {
        this.resultTree.forEach(rootFolderNode => {
            rootFolderNode.children.forEach(fileNode => this.expansionService.collapseNode(fileNode));
            if (rootFolderNode.visible) {
                this.expansionService.collapseNode(rootFolderNode);
            }
        });
    }

    async search(searchTerm: string, searchOptions: SearchInWorkspaceOptions): Promise<void> {
        this.searchTerm = searchTerm;
        const collapseValue: string = this.searchInWorkspacePreferences['search.collapseResults'];
        this.resultTree.clear();
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;
        if (searchTerm === '') {
            this.refreshModelChildren();
            return;
        }
        const progress = await this.progressService.showProgress({ text: `search: ${searchTerm}`, options: { location: 'search' } });
        const searchId = await this.searchService.search(searchTerm, {
            onResult: (aSearchId: number, result: SearchInWorkspaceResult) => {
                if (token.isCancellationRequested || aSearchId !== searchId) {
                    return;
                }
                const { name, path } = this.filenameAndPath(result.root, result.fileUri);
                const tree = this.resultTree;
                const rootFolderNode = tree.get(result.root);

                if (rootFolderNode) {
                    const fileNode = rootFolderNode.children.find(f => f.fileUri === result.fileUri);
                    if (fileNode) {
                        const line = this.createResultLineNode(result, fileNode);
                        if (fileNode.children.findIndex(lineNode => lineNode.id === line.id) < 0) {
                            fileNode.children.push(line);
                        }
                        this.collapseFileNode(fileNode, collapseValue);
                    } else {
                        const newFileNode = this.createFileNode(result.root, name, path, result.fileUri, rootFolderNode);
                        this.collapseFileNode(newFileNode, collapseValue);
                        const line = this.createResultLineNode(result, newFileNode);
                        newFileNode.children.push(line);
                        rootFolderNode.children.push(newFileNode);
                    }

                } else {
                    const newRootFolderNode = this.createRootFolderNode(result.root);
                    tree.set(result.root, newRootFolderNode);
                    const newFileNode = this.createFileNode(result.root, name, path, result.fileUri, newRootFolderNode);
                    this.collapseFileNode(newFileNode, collapseValue);
                    newFileNode.children.push(this.createResultLineNode(result, newFileNode));
                    newRootFolderNode.children.push(newFileNode);
                }
            },
            onDone: () => {
                progress.cancel();
                if (token.isCancellationRequested) {
                    return;
                }
                // Sort the result map by folder URI.
                this.resultTree = new Map([...this.resultTree]
                    .sort((a: [string, SearchInWorkspaceRootFolderNode], b: [string, SearchInWorkspaceRootFolderNode]) => this.compare(a[1].folderUri, b[1].folderUri)));
                // Update the list of children nodes, sorting them by their file URI.
                Array.from(this.resultTree.values())
                    .forEach((folder: SearchInWorkspaceRootFolderNode) => {
                        folder.children = folder.children.sort((a: SearchInWorkspaceFileNode, b: SearchInWorkspaceFileNode) => this.compare(a.fileUri, b.fileUri));
                    });
                this.refreshModelChildren();
            }
        }, searchOptions).catch(e => { return; });
        token.onCancellationRequested(() => {
            progress.cancel();
            if (searchId) {
                this.searchService.cancel(searchId);
            }
        });
    }

    focusFirstResult(): void {
        if (SearchInWorkspaceRoot.is(this.model.root) && this.model.root.children.length > 0) {
            const node = this.model.root.children[0];
            if (SelectableTreeNode.is(node)) {
                this.node.focus();
                this.model.selectNode(node);
            }
        }
    }

    /**
     * Collapse the search-in-workspace file node
     * based on the preference value.
     */
    protected collapseFileNode(node: SearchInWorkspaceFileNode, preferenceValue: string): void {
        if (preferenceValue === 'auto' && node.children.length >= 10) {
            node.expanded = false;
        } else if (preferenceValue === 'alwaysCollapse') {
            node.expanded = false;
        } else if (preferenceValue === 'alwaysExpand') {
            node.expanded = true;
        }
    }

    protected handleUp(event: KeyboardEvent): void {
        if (!this.model.getPrevSelectableNode(this.model.selectedNodes[0])) {
            this.focusInputEmitter.fire(true);
        } else {
            super.handleUp(event);
        }
    }

    protected async refreshModelChildren(): Promise<void> {
        if (SearchInWorkspaceRoot.is(this.model.root)) {
            await this.updateFileIcons();
            this.model.root.children = Array.from(this.resultTree.values());
            this.model.refresh();
            this.updateCurrentEditorDecorations();
        }
    }

    protected updateCurrentEditorDecorations(): void {
        this.shell.allTabBars.map(tb => {
            const currentTitle = tb.currentTitle;
            if (currentTitle && currentTitle.owner instanceof EditorWidget) {
                const widget = currentTitle.owner;
                const fileNodes = this.getFileNodesByUri(widget.editor.uri);
                if (fileNodes.length > 0) {
                    fileNodes.forEach(node => {
                        this.decorateEditor(node, widget);
                    });
                } else {
                    this.decorateEditor(undefined, widget);
                }
            }
        });

        const currentWidget = this.editorManager.currentEditor;
        if (currentWidget) {
            const fileNodes = this.getFileNodesByUri(currentWidget.editor.uri);
            fileNodes.forEach(node => {
                this.decorateEditor(node, currentWidget);
            });
        }
    }

    protected createRootFolderNode(rootUri: string): SearchInWorkspaceRootFolderNode {
        const uri = new URI(rootUri);
        return {
            selected: false,
            name: uri.displayName,
            path: uri.path.toString(),
            folderUri: rootUri,
            children: [],
            expanded: true,
            id: rootUri,
            parent: this.model.root as SearchInWorkspaceRoot,
            icon: FOLDER_ICON,
            visible: this.workspaceService.isMultiRootWorkspaceOpened
        };
    }

    protected createFileNode(rootUri: string, name: string, path: string, fileUri: string, parent: SearchInWorkspaceRootFolderNode): SearchInWorkspaceFileNode {
        return {
            selected: false,
            name,
            path,
            children: [],
            expanded: true,
            id: `${rootUri}::${fileUri}`,
            parent,
            icon: FILE_ICON, // placeholder. updateFileIcons() will replace the placeholders with icons used in the tree rendering
            fileUri
        };
    }

    protected async updateFileIcons(): Promise<void> {
        for (const folderNode of this.resultTree.values()) {
            for (const fileNode of folderNode.children) {
                fileNode.icon = await this.labelProvider.getIcon(new URI(fileNode.fileUri).withScheme('file'));
            }
        }
    }

    protected createResultLineNode(result: SearchInWorkspaceResult, fileNode: SearchInWorkspaceFileNode): SearchInWorkspaceResultLineNode {
        return {
            ...result,
            selected: false,
            id: result.fileUri + '-' + result.line + '-' + result.character + '-' + result.length,
            name: result.lineText,
            parent: fileNode
        };
    }

    protected getFileNodesByUri(uri: URI): SearchInWorkspaceFileNode[] {
        const nodes: SearchInWorkspaceFileNode[] = [];
        const fileUri = uri.withScheme('file').toString();
        for (const rootFolderNode of this.resultTree.values()) {
            const rootUri = new URI(rootFolderNode.path).withScheme('file');
            if (rootUri.isEqualOrParent(uri)) {
                for (const fileNode of rootFolderNode.children) {
                    if (fileNode.fileUri === fileUri) {
                        nodes.push(fileNode);
                    }
                }
            }
        }
        return nodes;
    }

    protected filenameAndPath(rootUriStr: string, uriStr: string): { name: string, path: string } {
        const uri: URI = new URI(uriStr);
        const relativePath = new URI(rootUriStr).relative(uri.parent);
        return {
            name: uri.displayName,
            path: relativePath ? relativePath.toString() : ''
        };
    }

    protected renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (SearchInWorkspaceRootFolderNode.is(node)) {
            return this.renderRootFolderNode(node);
        } else if (SearchInWorkspaceFileNode.is(node)) {
            return this.renderFileNode(node);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            return this.renderResultLineNode(node);
        }
        return '';
    }

    protected renderTailDecorations(node: TreeNode, props: NodeProps): React.ReactNode {
        return <div className='result-node-buttons'>
            {this._showReplaceButtons && this.renderReplaceButton(node)}
            {this.renderRemoveButton(node)}
        </div>;
    }

    protected doReplace(node: TreeNode, e: React.MouseEvent<HTMLElement>): void {
        this.replace(node);
        e.stopPropagation();
    }

    protected renderReplaceButton(node: TreeNode): React.ReactNode {
        const isResultLineNode = SearchInWorkspaceResultLineNode.is(node);
        return <span className={isResultLineNode ? 'replace-result' : 'replace-all-result'}
            onClick={e => this.doReplace(node, e)}
            title={isResultLineNode ? 'Replace' : 'Replace All'}></span>;
    }

    protected getFileCount(node: TreeNode): number {
        if (SearchInWorkspaceRoot.is(node)) {
            return node.children.reduce((acc, current) => acc + this.getFileCount(current), 0);
        } else if (SearchInWorkspaceRootFolderNode.is(node)) {
            return node.children.length;
        } else if (SearchInWorkspaceFileNode.is(node)) {
            return 1;
        }
        return 0;
    }

    protected getResultCount(node: TreeNode): number {
        if (SearchInWorkspaceRoot.is(node)) {
            return node.children.reduce((acc, current) => acc + this.getResultCount(current), 0);
        } else if (SearchInWorkspaceRootFolderNode.is(node)) {
            return node.children.reduce((acc, current) => acc + this.getResultCount(current), 0);
        } else if (SearchInWorkspaceFileNode.is(node)) {
            return node.children.length;
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            return 1;
        }
        return 0;
    }

    /**
     * Replace results under the node passed into the function. If node is undefined, replace all results.
     * @param node Node in the tree widget where the "replace all" operation is performed
     */
    async replace(node: TreeNode | undefined): Promise<void> {
        const replaceForNode = node || this.model.root!;
        const needConfirm = !SearchInWorkspaceFileNode.is(node) && !SearchInWorkspaceResultLineNode.is(node);
        if (!needConfirm || await this.confirmReplaceAll(this.getResultCount(replaceForNode), this.getFileCount(replaceForNode))) {
            (node ? [node] : Array.from(this.resultTree.values())).forEach(n => {
                this.replaceResult(n, !!node);
                this.removeNode(n);
            });
        }
    }

    protected confirmReplaceAll(resultNumber: number, fileNumber: number): Promise<boolean | undefined> {
        const go = fileNumber > 1;
        return new ConfirmDialog({
            title: 'Replace all',
            msg: `Do you really want to replace ${resultNumber} match${resultNumber > 1 ? 'es' : ''} ${go ? 'across' : 'in'} `
                + `${fileNumber} file${go ? 's' : ''} with "${this._replaceTerm}"?`
        }).open();
    }

    protected updateRightResults(node: SearchInWorkspaceResultLineNode): void {
        const fileNode = node.parent;
        const rightPositionedNodes = fileNode.children.filter(rl => rl.line === node.line && rl.character > node.character);
        const diff = this._replaceTerm.length - this.searchTerm.length;
        rightPositionedNodes.map(r => r.character += diff);
    }

    /**
     * Replace text either in all search matches under a node or in all search matches, and save the changes.
     * @param node - node in the tree widget in which the "replace all" is performed.
     * @param {boolean} replaceOne - whether the function is to replace all matches under a node. If it is false, replace all.
     */
    protected async replaceResult(node: TreeNode, replaceOne: boolean): Promise<void> {
        const toReplace: SearchInWorkspaceResultLineNode[] = [];
        if (SearchInWorkspaceRootFolderNode.is(node)) {
            node.children.forEach(fileNode => this.replaceResult(fileNode, replaceOne));
        } else if (SearchInWorkspaceFileNode.is(node)) {
            toReplace.push(...node.children);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            toReplace.push(node);
            this.updateRightResults(node);
        }

        if (toReplace.length > 0) {
            // Store the state of all tracked editors before another editor widget might be created for text replacing.
            const trackedEditors: EditorWidget[] = this.editorManager.all;
            // Open the file only if the function is called to replace all matches under a specific node.
            const widget: EditorWidget = replaceOne ? await this.doOpen(toReplace[0]) : await this.doGetWidget(toReplace[0]);
            const source: string = widget.editor.document.getText();
            const replaceOperations = toReplace.map(resultLineNode => ({
                text: this._replaceTerm,
                range: {
                    start: {
                        line: resultLineNode.line - 1,
                        character: resultLineNode.character - 1
                    },
                    end: {
                        line: resultLineNode.line - 1,
                        character: resultLineNode.character - 1 + resultLineNode.length
                    }
                }
            } as ReplaceOperation));
            // Replace the text.
            await widget.editor.replaceText({
                source,
                replaceOperations
            });
            // Save the text replacement changes in the editor.
            await widget.saveable.save();
            // Dispose the widget if it is not opened but created for `replaceAll`.
            if (!replaceOne) {
                if (trackedEditors.indexOf(widget) === -1) {
                    widget.dispose();
                }
            }
        }
    }

    protected readonly remove = (node: TreeNode, e: React.MouseEvent<HTMLElement>) => this.doRemove(node, e);
    protected doRemove(node: TreeNode, e: React.MouseEvent<HTMLElement>): void {
        this.removeNode(node);
        e.stopPropagation();
    }

    protected renderRemoveButton(node: TreeNode): React.ReactNode {
        return <span className='remove-node' onClick={e => this.remove(node, e)} title='Dismiss'></span>;
    }

    protected removeNode(node: TreeNode): void {
        if (SearchInWorkspaceRootFolderNode.is(node)) {
            this.removeRootFolderNode(node);
        } else if (SearchInWorkspaceFileNode.is(node)) {
            this.removeFileNode(node);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            this.removeResultLineNode(node);
        }
        this.refreshModelChildren();
    }

    private removeRootFolderNode(node: SearchInWorkspaceRootFolderNode): void {
        for (const rootUri of this.resultTree.keys()) {
            if (rootUri === node.folderUri) {
                this.resultTree.delete(rootUri);
                break;
            }
        }
    }

    private removeFileNode(node: SearchInWorkspaceFileNode): void {
        const rootFolderNode = node.parent;
        const index = rootFolderNode.children.findIndex(fileNode => fileNode.id === node.id);
        if (index > -1) {
            rootFolderNode.children.splice(index, 1);
        }
        if (this.getFileCount(rootFolderNode) === 0) {
            this.removeRootFolderNode(rootFolderNode);
        }
    }

    private removeResultLineNode(node: SearchInWorkspaceResultLineNode): void {
        const fileNode = node.parent;
        const index = fileNode.children.findIndex(n => n.fileUri === node.fileUri && n.line === node.line && n.character === node.character);
        if (index > -1) {
            fileNode.children.splice(index, 1);
            if (this.getResultCount(fileNode) === 0) {
                this.removeFileNode(fileNode);
            }
        }
    }

    protected renderRootFolderNode(node: SearchInWorkspaceRootFolderNode): React.ReactNode {
        const icon = node.icon;
        return <div className='result'>
            <div className='result-head'>
                <div className={`result-head-info noWrapInfo noselect ${node.selected ? 'selected' : ''}`}>
                    <span className={`file-icon ${icon || ''}`}></span>
                    <span className={'file-name'}>
                        {node.name}
                    </span>
                    <span className={'file-path'}>
                        {node.path}
                    </span>
                </div>
                <span className='notification-count-container highlighted-count-container'>
                    <span className='notification-count'>
                        {this.getFileCount(node)}
                    </span>
                </span>
            </div>
        </div>;
    }

    protected renderFileNode(node: SearchInWorkspaceFileNode): React.ReactNode {
        const icon = node.icon;
        return <div className='result'>
            <div className='result-head'>
                <div className={`result-head-info noWrapInfo noselect ${node.selected ? 'selected' : ''}`}
                    title={new URI(node.fileUri).path.toString()}>
                    <span className={`file-icon ${icon || ''}`}></span>
                    <span className={'file-name'}>
                        {node.name}
                    </span>
                    <span className={'file-path'}>
                        {node.path}
                    </span>
                </div>
                <span className='notification-count-container'>
                    <span className='notification-count'>
                        {this.getResultCount(node)}
                    </span>
                </span>
            </div>
        </div>;
    }

    protected renderResultLineNode(node: SearchInWorkspaceResultLineNode): React.ReactNode {
        const prefix = node.character > 26 ? '... ' : '';
        return <div className={`resultLine noWrapInfo ${node.selected ? 'selected' : ''}`} title={node.lineText.trim()}>
            {this.searchInWorkspacePreferences['search.lineNumbers'] && <span className='theia-siw-lineNumber'>{node.line}</span>}
            <span>
                {prefix + node.lineText.substr(0, node.character - 1).substr(-25)}
            </span>
            {this.renderMatchLinePart(node)}
            <span>
                {node.lineText.substr(node.character - 1 + node.length, 75)}
            </span>
        </div>;
    }

    protected renderMatchLinePart(node: SearchInWorkspaceResultLineNode): React.ReactNode {
        const replaceTerm = this._replaceTerm !== '' && this._showReplaceButtons ? <span className='replace-term'>{this._replaceTerm}</span> : '';
        const className = `match${this._showReplaceButtons ? ' strike-through' : ''}`;
        return <React.Fragment>
            <span className={className}>{node.lineText.substr(node.character - 1, node.length)}</span>
            {replaceTerm}
        </React.Fragment>;
    }

    /**
     * Get the editor widget by the node.
     * @param {SearchInWorkspaceResultLineNode} node - the node representing a match in the search results.
     * @returns The editor widget to which the text replace will be done.
     */
    protected async doGetWidget(node: SearchInWorkspaceResultLineNode): Promise<EditorWidget> {
        const fileUri = new URI(node.fileUri);
        const editorWidget = await this.editorManager.getOrCreateByUri(fileUri);
        return editorWidget;
    }

    protected async doOpen(node: SearchInWorkspaceResultLineNode, preview: boolean = false): Promise<EditorWidget> {
        let fileUri: URI;
        const resultNode = node.parent;
        if (resultNode && this._showReplaceButtons && preview) {
            const leftUri = new URI(node.fileUri);
            const rightUri = await this.createReplacePreview(resultNode);
            fileUri = DiffUris.encode(leftUri, rightUri);
        } else {
            fileUri = new URI(node.fileUri);
        }

        const opts: EditorOpenerOptions | undefined = !DiffUris.isDiffUri(fileUri) ? {
            selection: {
                start: {
                    line: node.line - 1,
                    character: node.character - 1
                },
                end: {
                    line: node.line - 1,
                    character: node.character - 1 + node.length
                }
            },
            mode: 'reveal'
        } : undefined;

        const editorWidget = await this.editorManager.open(fileUri, opts);

        if (!DiffUris.isDiffUri(fileUri)) {
            this.decorateEditor(resultNode, editorWidget);
        }

        return editorWidget;
    }

    protected async createReplacePreview(node: SearchInWorkspaceFileNode): Promise<URI> {
        const fileUri = new URI(node.fileUri).withScheme('file');
        const resource = await this.fileResourceResolver.resolve(fileUri);
        const content = await resource.readContents();

        const lines = content.split('\n');
        node.children.map(l => {
            const leftPositionedNodes = node.children.filter(rl => rl.line === l.line && rl.character < l.character);
            const diff = (this._replaceTerm.length - this.searchTerm.length) * leftPositionedNodes.length;
            const start = lines[l.line - 1].substr(0, l.character - 1 + diff);
            const end = lines[l.line - 1].substr(l.character - 1 + diff + l.length);
            lines[l.line - 1] = start + this._replaceTerm + end;
        });

        return fileUri.withScheme(MEMORY_TEXT).withQuery(lines.join('\n'));
    }

    protected decorateEditor(node: SearchInWorkspaceFileNode | undefined, editorWidget: EditorWidget): void {
        if (!DiffUris.isDiffUri(editorWidget.editor.uri)) {
            const key = `${editorWidget.editor.uri.toString()}#search-in-workspace-matches`;
            const oldDecorations = this.appliedDecorations.get(key) || [];
            const newDecorations = this.createEditorDecorations(node);
            const appliedDecorations = editorWidget.editor.deltaDecorations({
                newDecorations,
                oldDecorations,
            });
            this.appliedDecorations.set(key, appliedDecorations);
        }
    }

    protected createEditorDecorations(resultNode: SearchInWorkspaceFileNode | undefined): EditorDecoration[] {
        const decorations: EditorDecoration[] = [];
        if (resultNode) {
            resultNode.children.map(res => {
                decorations.push({
                    range: {
                        start: {
                            line: res.line - 1,
                            character: res.character - 1
                        },
                        end: {
                            line: res.line - 1,
                            character: res.character - 1 + res.length
                        }
                    },
                    options: {
                        overviewRuler: {
                            color: 'rgba(230, 0, 0, 1)',
                            position: OverviewRulerLane.Full
                        },
                        className: res.selected ? 'current-search-in-workspace-editor-match' : 'search-in-workspace-editor-match',
                        stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
                    }
                });
            });
        }
        return decorations;
    }

    /**
     * Compare two normalized strings.
     *
     * @param a {string} the first string.
     * @param b {string} the second string.
     */
    private compare(a: string, b: string): number {
        const itemA: string = a.toLowerCase().trim();
        const itemB: string = b.toLowerCase().trim();
        return itemA.localeCompare(itemB);
    }

}
