// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
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
    TreeProps,
    TreeExpansionService,
    ApplicationShell,
    DiffUris,
    TREE_NODE_INFO_CLASS,
    codicon,
    TopDownTreeIterator
} from '@theia/core/lib/browser';
import { CancellationTokenSource, Emitter, EOL, Event, ProgressService } from '@theia/core';
import {
    EditorManager, EditorDecoration, TrackedRangeStickiness, OverviewRulerLane,
    EditorWidget, EditorOpenerOptions, FindMatch, Position
} from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileResourceResolver, FileSystemPreferences } from '@theia/filesystem/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { SearchInWorkspaceResult, SearchInWorkspaceOptions, SearchMatch } from '../common/search-in-workspace-interface';
import { SearchInWorkspaceService } from './search-in-workspace-service';
import { MEMORY_TEXT } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import * as React from '@theia/core/shared/react';
import { SearchInWorkspacePreferences } from './search-in-workspace-preferences';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import * as minimatch from 'minimatch';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import debounce = require('@theia/core/shared/lodash.debounce');
import { nls } from '@theia/core/lib/common/nls';

const ROOT_ID = 'ResultTree';

export interface SearchInWorkspaceRoot extends CompositeTreeNode {
    children: SearchInWorkspaceRootFolderNode[];
}
export namespace SearchInWorkspaceRoot {
    export function is(node: unknown): node is SearchInWorkspaceRoot {
        return CompositeTreeNode.is(node) && node.id === ROOT_ID;
    }
}
export interface SearchInWorkspaceRootFolderNode extends ExpandableTreeNode, SelectableTreeNode { // root folder node
    name?: undefined
    icon?: undefined
    children: SearchInWorkspaceFileNode[];
    parent: SearchInWorkspaceRoot;
    path: string;
    folderUri: string;
    uri: URI;
}
export namespace SearchInWorkspaceRootFolderNode {
    export function is(node: unknown): node is SearchInWorkspaceRootFolderNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && 'path' in node && 'folderUri' in node && !('fileUri' in node);
    }
}

export interface SearchInWorkspaceFileNode extends ExpandableTreeNode, SelectableTreeNode { // file node
    name?: undefined
    icon?: undefined
    children: SearchInWorkspaceResultLineNode[];
    parent: SearchInWorkspaceRootFolderNode;
    path: string;
    fileUri: string;
    uri: URI;
}
export namespace SearchInWorkspaceFileNode {
    export function is(node: unknown): node is SearchInWorkspaceFileNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && 'path' in node && 'fileUri' in node && !('folderUri' in node);
    }
}

export interface SearchInWorkspaceResultLineNode extends SelectableTreeNode, SearchInWorkspaceResult, SearchMatch { // line node
    parent: SearchInWorkspaceFileNode
}
export namespace SearchInWorkspaceResultLineNode {
    export function is(node: unknown): node is SearchInWorkspaceResultLineNode {
        return SelectableTreeNode.is(node) && 'line' in node && 'character' in node && 'lineText' in node;
    }
}

@injectable()
export class SearchInWorkspaceResultTreeWidget extends TreeWidget {

    protected resultTree: Map<string, SearchInWorkspaceRootFolderNode>;

    protected _showReplaceButtons = false;
    protected _replaceTerm = '';
    protected searchTerm = '';
    protected searchOptions: SearchInWorkspaceOptions;

    protected readonly startSearchOnModification = (activeEditor: EditorWidget) => debounce(
        () => this.searchActiveEditor(activeEditor, this.searchTerm, this.searchOptions),
        this.searchOnEditorModificationDelay
    );

    protected readonly searchOnEditorModificationDelay = 300;
    protected readonly toDisposeOnActiveEditorChanged = new DisposableCollection();

    // The default root name to add external search results in the case that a workspace is opened.
    protected readonly defaultRootName = nls.localizeByDefault('Other files');
    protected forceVisibleRootNode = false;

    protected appliedDecorations = new Map<string, string[]>();

    cancelIndicator?: CancellationTokenSource;

    protected changeEmitter = new Emitter<Map<string, SearchInWorkspaceRootFolderNode>>();

    protected onExpansionChangedEmitter = new Emitter();
    readonly onExpansionChanged: Event<void> = this.onExpansionChangedEmitter.event;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected focusInputEmitter = new Emitter<any>();

    @inject(SearchInWorkspaceService) protected readonly searchService: SearchInWorkspaceService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(FileResourceResolver) protected readonly fileResourceResolver: FileResourceResolver;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(TreeExpansionService) protected readonly expansionService: TreeExpansionService;
    @inject(SearchInWorkspacePreferences) protected readonly searchInWorkspacePreferences: SearchInWorkspacePreferences;
    @inject(ProgressService) protected readonly progressService: ProgressService;
    @inject(ColorRegistry) protected readonly colorRegistry: ColorRegistry;
    @inject(FileSystemPreferences) protected readonly filesystemPreferences: FileSystemPreferences;
    @inject(FileService) protected readonly fileService: FileService;

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        model.root = {
            id: ROOT_ID,
            parent: undefined,
            visible: false,
            children: []
        } as SearchInWorkspaceRoot;

        this.toDispose.push(model.onSelectionChanged(nodes => {
            const node = nodes[0];
            if (SearchInWorkspaceResultLineNode.is(node)) {
                this.doOpen(node, true, true);
            }
        }));
        this.toDispose.push(model.onOpenNode(node => {
            if (SearchInWorkspaceResultLineNode.is(node)) {
                this.doOpen(node, true, false);
            }
        }));

        this.resultTree = new Map<string, SearchInWorkspaceRootFolderNode>();
        this.toDispose.push(model.onNodeRefreshed(() => this.changeEmitter.fire(this.resultTree)));
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.addClass('resultContainer');

        this.toDispose.push(this.changeEmitter);
        this.toDispose.push(this.focusInputEmitter);

        this.toDispose.push(this.editorManager.onActiveEditorChanged(activeEditor => {
            this.updateCurrentEditorDecorations();
            this.toDisposeOnActiveEditorChanged.dispose();
            this.toDispose.push(this.toDisposeOnActiveEditorChanged);
            if (activeEditor) {
                this.toDisposeOnActiveEditorChanged.push(activeEditor.editor.onDocumentContentChanged(() => {
                    if (this.searchTerm !== '' && this.searchInWorkspacePreferences['search.searchOnEditorModification']) {
                        this.startSearchOnModification(activeEditor)();
                    }
                }));
            }
        }));

        this.toDispose.push(this.searchInWorkspacePreferences.onPreferenceChanged(() => {
            this.update();
        }));

        this.toDispose.push(this.fileService.onDidFilesChange(event => {
            if (event.gotDeleted()) {
                event.getDeleted().forEach(deletedFile => {
                    const fileNodes = this.getFileNodesByUri(deletedFile.resource);
                    fileNodes.forEach(node => this.removeFileNode(node));
                });
                this.model.refresh();
            }
        }));

        this.toDispose.push(this.model.onExpansionChanged(() => {
            this.onExpansionChangedEmitter.fire(undefined);
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

    get isReplacing(): boolean {
        return this._replaceTerm !== '' && this._showReplaceButtons;
    }

    get onChange(): Event<Map<string, SearchInWorkspaceRootFolderNode>> {
        return this.changeEmitter.event;
    }

    get onFocusInput(): Event<void> {
        return this.focusInputEmitter.event;
    }

    collapseAll(): void {
        for (const rootFolderNode of this.resultTree.values()) {
            for (const fileNode of rootFolderNode.children) {
                this.expansionService.collapseNode(fileNode);
            }
            if (rootFolderNode.visible) {
                this.expansionService.collapseNode(rootFolderNode);
            }
        }
    }

    expandAll(): void {
        for (const rootFolderNode of this.resultTree.values()) {
            for (const fileNode of rootFolderNode.children) {
                this.expansionService.expandNode(fileNode);
            }
            if (rootFolderNode.visible) {
                this.expansionService.expandNode(rootFolderNode);
            }
        }
    }

    areResultsCollapsed(): boolean {
        for (const rootFolderNode of this.resultTree.values()) {
            for (const fileNode of rootFolderNode.children) {
                if (!ExpandableTreeNode.isCollapsed(fileNode)) {
                    return false;
                }
            }
        }
        return true;
    }

    selectNextResult(): void {
        if (!this.model.getFocusedNode()) {
            return this.selectFirstResult();
        }
        let foundNextResult = false;
        while (!foundNextResult) {
            const nextNode = this.model.getNextNode();
            if (!nextNode) {
                return this.selectFirstResult();
            } else if (SearchInWorkspaceResultLineNode.is(nextNode)) {
                foundNextResult = true;
                this.selectExpandOpenResultNode(nextNode);
            } else {
                this.model.selectNext();
            }
        }
    }

    selectPreviousResult(): void {
        if (!this.model.getFocusedNode()) {
            return this.selectLastResult();
        }
        let foundSelectedNode = false;
        while (!foundSelectedNode) {
            const prevNode = this.model.getPrevNode();
            if (!prevNode) {
                return this.selectLastResult();
            } else if (SearchInWorkspaceResultLineNode.is(prevNode)) {
                foundSelectedNode = true;
                this.selectExpandOpenResultNode(prevNode);
            } else if (prevNode.id === 'ResultTree') {
                return this.selectLastResult();
            } else {
                this.model.selectPrev();
            }
        }
    }

    protected selectExpandOpenResultNode(node: SearchInWorkspaceResultLineNode): void {
        this.model.expandNode(node.parent.parent);
        this.model.expandNode(node.parent);
        this.model.selectNode(node);
        this.model.openNode(node);
    }

    protected selectFirstResult(): void {
        for (const rootFolder of this.resultTree.values()) {
            for (const file of rootFolder.children) {
                for (const result of file.children) {
                    if (SelectableTreeNode.is(result)) {
                        return this.selectExpandOpenResultNode(result);
                    }
                }
            }
        }
    }

    protected selectLastResult(): void {
        const rootFolders = Array.from(this.resultTree.values());
        for (let i = rootFolders.length - 1; i >= 0; i--) {
            const rootFolder = rootFolders[i];
            for (let j = rootFolder.children.length - 1; j >= 0; j--) {
                const file = rootFolder.children[j];
                for (let k = file.children.length - 1; k >= 0; k--) {
                    const result = file.children[k];
                    if (SelectableTreeNode.is(result)) {
                        return this.selectExpandOpenResultNode(result);
                    }
                }
            }
        }
    }

    /**
     * Find matches for the given editor.
     * @param searchTerm the search term.
     * @param widget the editor widget.
     * @param searchOptions the search options to apply.
     *
     * @returns the list of matches.
     */
    protected findMatches(searchTerm: string, widget: EditorWidget, searchOptions: SearchInWorkspaceOptions): SearchMatch[] {
        if (!widget.editor.document.findMatches) {
            return [];
        }
        const results: FindMatch[] = widget.editor.document.findMatches({
            searchString: searchTerm,
            isRegex: !!searchOptions.useRegExp,
            matchCase: !!searchOptions.matchCase,
            matchWholeWord: !!searchOptions.matchWholeWord,
            limitResultCount: searchOptions.maxResults
        });

        const matches: SearchMatch[] = [];
        results.forEach(r => {
            const numberOfLines = searchTerm.split('\n').length;
            const lineTexts = [];
            for (let i = 0; i < numberOfLines; i++) {
                lineTexts.push(widget.editor.document.getLineContent(r.range.start.line + i));
            }
            matches.push({
                line: r.range.start.line,
                character: r.range.start.character,
                length: searchTerm.length,
                lineText: lineTexts.join('\n')
            });
        });

        return matches;
    }

    /**
     * Convert a pattern to match all directories.
     * @param workspaceRootUri the uri of the current workspace root.
     * @param pattern the pattern to be converted.
     */
    protected convertPatternToGlob(workspaceRootUri: URI | undefined, pattern: string): string {
        if (pattern.startsWith('**/')) {
            return pattern;
        }
        if (pattern.startsWith('./')) {
            if (workspaceRootUri === undefined) {
                return pattern;
            }
            return workspaceRootUri.toString() + pattern.replace('./', '/');
        }
        return pattern.startsWith('/')
            ? '**' + pattern
            : '**/' + pattern;
    }

    /**
     * Determine if the URI matches any of the patterns.
     * @param uri the editor URI.
     * @param patterns the glob patterns to verify.
     */
    protected inPatternList(uri: URI, patterns: string[]): boolean {
        const opts: minimatch.IOptions = { dot: true, matchBase: true };
        return patterns.some(pattern => minimatch(
            uri.toString(),
            this.convertPatternToGlob(this.workspaceService.getWorkspaceRootUri(uri), pattern),
            opts
        ));
    }

    /**
     * Determine if the given editor satisfies the filtering criteria.
     * An editor should be searched only if:
     * - it is not excluded through the `excludes` list.
     * - it is not explicitly present in a non-empty `includes` list.
     */
    protected shouldApplySearch(editorWidget: EditorWidget, searchOptions: SearchInWorkspaceOptions): boolean {
        const excludePatterns = this.getExcludeGlobs(searchOptions.exclude);
        if (this.inPatternList(editorWidget.editor.uri, excludePatterns)) {
            return false;
        }

        const includePatterns = searchOptions.include;
        if (!!includePatterns?.length && !this.inPatternList(editorWidget.editor.uri, includePatterns)) {
            return false;
        }

        return true;
    }

    /**
     * Search the active editor only and update the tree with those results.
     */
    protected searchActiveEditor(activeEditor: EditorWidget, searchTerm: string, searchOptions: SearchInWorkspaceOptions): void {
        const includesExternalResults = () => !!this.resultTree.get(this.defaultRootName);

        // Check if outside workspace results are present before searching.
        const hasExternalResultsBefore = includesExternalResults();

        // Collect search results for the given editor.
        const results = this.searchInEditor(activeEditor, searchTerm, searchOptions);

        // Update the tree by removing the result node, and add new results if applicable.
        this.getFileNodesByUri(activeEditor.editor.uri).forEach(fileNode => this.removeFileNode(fileNode));
        if (results) {
            this.appendToResultTree(results);
        }

        // Check if outside workspace results are present after searching.
        const hasExternalResultsAfter = includesExternalResults();

        // Redo a search to update the tree node visibility if:
        // + `Other files` node was present, now it is not.
        // + `Other files` node was not present, now it is.
        if (hasExternalResultsBefore ? !hasExternalResultsAfter : hasExternalResultsAfter) {
            this.search(this.searchTerm, this.searchOptions);
            return;
        }

        this.handleSearchCompleted();
    }

    /**
     * Perform a search in all open editors.
     * @param searchTerm the search term.
     * @param searchOptions the search options to apply.
     *
     * @returns the tuple of result count, and the list of search results.
     */
    protected searchInOpenEditors(searchTerm: string, searchOptions: SearchInWorkspaceOptions): {
        numberOfResults: number,
        matches: SearchInWorkspaceResult[]
    } {
        // Track the number of results found.
        let numberOfResults = 0;

        const searchResults: SearchInWorkspaceResult[] = [];

        this.editorManager.all.forEach(e => {
            const editorResults = this.searchInEditor(e, searchTerm, searchOptions);
            if (editorResults) {
                numberOfResults += editorResults.matches.length;
                searchResults.push(editorResults);
            }
        });

        return {
            numberOfResults,
            matches: searchResults
        };
    }

    /**
     * Perform a search in the target editor.
     * @param editorWidget the editor widget.
     * @param searchTerm the search term.
     * @param searchOptions the search options to apply.
     *
     * @returns the search results from the given editor, undefined if the editor is either filtered or has no matches found.
     */
    protected searchInEditor(editorWidget: EditorWidget, searchTerm: string, searchOptions: SearchInWorkspaceOptions): SearchInWorkspaceResult | undefined {
        if (!this.shouldApplySearch(editorWidget, searchOptions)) {
            return undefined;
        }

        const matches: SearchMatch[] = this.findMatches(searchTerm, editorWidget, searchOptions);
        if (matches.length <= 0) {
            return undefined;
        }

        const fileUri = editorWidget.editor.uri.toString();
        const root: string | undefined = this.workspaceService.getWorkspaceRootUri(editorWidget.editor.uri)?.toString();
        return {
            root: root ?? this.defaultRootName,
            fileUri,
            matches
        };
    }

    /**
     * Append search results to the result tree.
     * @param result Search result.
     */
    protected appendToResultTree(result: SearchInWorkspaceResult): void {
        const collapseValue: string = this.searchInWorkspacePreferences['search.collapseResults'];
        let path: string;
        if (result.root === this.defaultRootName) {
            path = new URI(result.fileUri).path.dir.fsPath();
        } else {
            path = this.filenameAndPath(result.root, result.fileUri).path;
        }
        const tree = this.resultTree;
        let rootFolderNode = tree.get(result.root);
        if (!rootFolderNode) {
            rootFolderNode = this.createRootFolderNode(result.root);
            tree.set(result.root, rootFolderNode);
        }
        let fileNode = rootFolderNode.children.find(f => f.fileUri === result.fileUri);
        if (!fileNode) {
            fileNode = this.createFileNode(result.root, path, result.fileUri, rootFolderNode);
            rootFolderNode.children.push(fileNode);
        }
        for (const match of result.matches) {
            const line = this.createResultLineNode(result, match, fileNode);
            if (fileNode.children.findIndex(lineNode => lineNode.id === line.id) < 0) {
                fileNode.children.push(line);
            }
        }
        this.collapseFileNode(fileNode, collapseValue);
    }

    /**
     * Handle when searching completed.
     */
    protected handleSearchCompleted(cancelIndicator?: CancellationTokenSource): void {
        if (cancelIndicator) {
            cancelIndicator.cancel();
        }
        this.sortResultTree();
        this.refreshModelChildren();
    }

    /**
     * Sort the result tree by URIs.
     */
    protected sortResultTree(): void {
        // Sort the result map by folder URI.
        const entries = [...this.resultTree.entries()];
        entries.sort(([, a], [, b]) => this.compare(a.folderUri, b.folderUri));
        this.resultTree = new Map(entries);
        // Update the list of children nodes, sorting them by their file URI.
        entries.forEach(([, folder]) => {
            folder.children.sort((a, b) => this.compare(a.fileUri, b.fileUri));
        });
    }

    /**
     * Search and populate the result tree with matches.
     * @param searchTerm the search term.
     * @param searchOptions the search options to apply.
     */
    async search(searchTerm: string, searchOptions: SearchInWorkspaceOptions): Promise<void> {
        this.searchTerm = searchTerm;
        this.searchOptions = searchOptions;
        searchOptions = {
            ...searchOptions,
            exclude: this.getExcludeGlobs(searchOptions.exclude)
        };
        this.resultTree.clear();
        this.forceVisibleRootNode = false;
        if (this.cancelIndicator) {
            this.cancelIndicator.cancel();
        }
        if (searchTerm === '') {
            this.refreshModelChildren();
            return;
        }
        this.cancelIndicator = new CancellationTokenSource();
        const cancelIndicator = this.cancelIndicator;
        const token = this.cancelIndicator.token;
        const progress = await this.progressService.showProgress({ text: `search: ${searchTerm}`, options: { location: 'search' } });
        token.onCancellationRequested(() => {
            progress.cancel();
            if (searchId) {
                this.searchService.cancel(searchId);
            }
            this.cancelIndicator = undefined;
            this.changeEmitter.fire(this.resultTree);
        });

        // Collect search results for opened editors which otherwise may not be found by ripgrep (ex: dirty editors).
        const { numberOfResults, matches } = this.searchInOpenEditors(searchTerm, searchOptions);

        // The root node is visible if outside workspace results are found and workspace root(s) are present.
        this.forceVisibleRootNode = matches.some(m => m.root === this.defaultRootName) && this.workspaceService.opened;

        matches.forEach(m => this.appendToResultTree(m));

        // Exclude files already covered by searching open editors.
        this.editorManager.all.forEach(e => {
            const excludePath: string = e.editor.uri.path.toString();
            searchOptions.exclude = searchOptions.exclude ? searchOptions.exclude.concat(excludePath) : [excludePath];
        });

        // Reduce `maxResults` due to editor results.
        if (searchOptions.maxResults) {
            searchOptions.maxResults -= numberOfResults;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let pendingRefreshTimeout: any;
        const searchId = await this.searchService.search(searchTerm, {
            onResult: (aSearchId: number, result: SearchInWorkspaceResult) => {
                if (token.isCancellationRequested || aSearchId !== searchId) {
                    return;
                }
                this.appendToResultTree(result);
                if (pendingRefreshTimeout) {
                    clearTimeout(pendingRefreshTimeout);
                }
                pendingRefreshTimeout = setTimeout(() => this.refreshModelChildren(), 100);
            },
            onDone: () => {
                this.handleSearchCompleted(cancelIndicator);
            }
        }, searchOptions).catch(() => {
            this.handleSearchCompleted(cancelIndicator);
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

    protected override handleUp(event: KeyboardEvent): void {
        if (!this.model.getPrevSelectableNode(this.model.getFocusedNode())) {
            this.focusInputEmitter.fire(true);
        } else {
            super.handleUp(event);
        }
    }

    protected async refreshModelChildren(): Promise<void> {
        if (SearchInWorkspaceRoot.is(this.model.root)) {
            this.model.root.children = Array.from(this.resultTree.values());
            this.model.refresh();
            this.updateCurrentEditorDecorations();
        }
    }

    protected updateCurrentEditorDecorations(): void {
        this.shell.allTabBars.forEach(tb => {
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
            path: uri.path.fsPath(),
            folderUri: rootUri,
            uri: new URI(rootUri),
            children: [],
            expanded: true,
            id: rootUri,
            parent: this.model.root as SearchInWorkspaceRoot,
            visible: this.forceVisibleRootNode || this.workspaceService.isMultiRootWorkspaceOpened
        };
    }

    protected createFileNode(rootUri: string, path: string, fileUri: string, parent: SearchInWorkspaceRootFolderNode): SearchInWorkspaceFileNode {
        return {
            selected: false,
            path,
            children: [],
            expanded: true,
            id: `${rootUri}::${fileUri}`,
            parent,
            fileUri,
            uri: new URI(fileUri),
        };
    }

    protected createResultLineNode(result: SearchInWorkspaceResult, match: SearchMatch, fileNode: SearchInWorkspaceFileNode): SearchInWorkspaceResultLineNode {
        return {
            ...result,
            ...match,
            selected: false,
            id: result.fileUri + '-' + match.line + '-' + match.character + '-' + match.length,
            name: typeof match.lineText === 'string' ? match.lineText : match.lineText.text,
            parent: fileNode
        };
    }

    protected getFileNodesByUri(uri: URI): SearchInWorkspaceFileNode[] {
        const nodes: SearchInWorkspaceFileNode[] = [];
        const fileUri = uri.withScheme('file').toString();
        for (const rootFolderNode of this.resultTree.values()) {
            const rootUri = new URI(rootFolderNode.path).withScheme('file');
            if (rootUri.isEqualOrParent(uri) || rootFolderNode.id === this.defaultRootName) {
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
            name: this.labelProvider.getName(uri),
            path: relativePath ? relativePath.fsPath() : ''
        };
    }

    protected override getDepthPadding(depth: number): number {
        return super.getDepthPadding(depth) + 5;
    }

    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        if (SearchInWorkspaceRootFolderNode.is(node)) {
            return this.renderRootFolderNode(node);
        } else if (SearchInWorkspaceFileNode.is(node)) {
            return this.renderFileNode(node);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            return this.renderResultLineNode(node);
        }
        return '';
    }

    protected override renderTailDecorations(node: TreeNode, props: NodeProps): React.ReactNode {
        return <div className='result-node-buttons'>
            {this._showReplaceButtons && this.renderReplaceButton(node)}
            {this.renderRemoveButton(node)}
        </div>;
    }

    protected doReplace(node: TreeNode, e: React.MouseEvent<HTMLElement>): void {
        const selection = SelectableTreeNode.isSelected(node) ? (this.selectionService.selection as SelectableTreeNode[]) : [node];
        selection.forEach(n => this.replace(n));
        e.stopPropagation();
    }

    protected renderReplaceButton(node: TreeNode): React.ReactNode {
        const isResultLineNode = SearchInWorkspaceResultLineNode.is(node);
        return <span className={isResultLineNode ? codicon('replace') : codicon('replace-all')}
            onClick={e => this.doReplace(node, e)}
            title={isResultLineNode
                ? nls.localizeByDefault('Replace')
                : nls.localizeByDefault('Replace All')
            }></span>;
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
        const replacementText = this._replaceTerm;
        if (!needConfirm || await this.confirmReplaceAll(this.getResultCount(replaceForNode), this.getFileCount(replaceForNode), replacementText)) {
            (node ? [node] : Array.from(this.resultTree.values())).forEach(n => {
                this.replaceResult(n, !!node, replacementText);
                this.removeNode(n);
            });
        }
    }

    protected confirmReplaceAll(resultNumber: number, fileNumber: number, replacementText: string): Promise<boolean | undefined> {
        return new ConfirmDialog({
            title: nls.localizeByDefault('Replace All'),
            msg: this.buildReplaceAllConfirmationMessage(resultNumber, fileNumber, replacementText)
        }).open();
    }

    protected buildReplaceAllConfirmationMessage(occurrences: number, fileCount: number, replaceValue: string): string {
        if (occurrences === 1) {
            if (fileCount === 1) {
                if (replaceValue) {
                    return nls.localizeByDefault(
                        "Replace {0} occurrence across {1} file with '{2}'?", occurrences, fileCount, replaceValue);
                }

                return nls.localizeByDefault(
                    'Replace {0} occurrence across {1} file?', occurrences, fileCount);
            }

            if (replaceValue) {
                return nls.localizeByDefault(
                    "Replace {0} occurrence across {1} files with '{2}'?", occurrences, fileCount, replaceValue);
            }

            return nls.localizeByDefault(
                'Replace {0} occurrence across {1} files?', occurrences, fileCount);
        }

        if (fileCount === 1) {
            if (replaceValue) {
                return nls.localizeByDefault(
                    "Replace {0} occurrences across {1} file with '{2}'?", occurrences, fileCount, replaceValue);
            }

            return nls.localizeByDefault(
                'Replace {0} occurrences across {1} file?', occurrences, fileCount);
        }

        if (replaceValue) {
            return nls.localizeByDefault(
                "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, replaceValue);
        }

        return nls.localizeByDefault(
            'Replace {0} occurrences across {1} files?', occurrences, fileCount);
    }

    protected updateRightResults(node: SearchInWorkspaceResultLineNode): void {
        const fileNode = node.parent;
        const rightPositionedNodes = fileNode.children.filter(rl => rl.line === node.line && rl.character > node.character);
        const diff = this._replaceTerm.length - this.searchTerm.length;
        rightPositionedNodes.forEach(r => r.character += diff);
    }

    /**
     * Replace text either in all search matches under a node or in all search matches, and save the changes.
     * @param node - node in the tree widget in which the "replace all" is performed.
     * @param {boolean} replaceOne - whether the function is to replace all matches under a node. If it is false, replace all.
     * @param replacementText - text to be used for all replacements in the current replacement cycle.
     */
    protected async replaceResult(node: TreeNode, replaceOne: boolean, replacementText: string): Promise<void> {
        const toReplace: SearchInWorkspaceResultLineNode[] = [];
        if (SearchInWorkspaceRootFolderNode.is(node)) {
            node.children.forEach(fileNode => this.replaceResult(fileNode, replaceOne, replacementText));
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
                text: replacementText,
                range: {
                    start: {
                        line: resultLineNode.line - 1,
                        character: resultLineNode.character - 1
                    },
                    end: this.findEndCharacterPosition(resultLineNode),
                }
            }));

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
        const selection = SelectableTreeNode.isSelected(node) ? (this.selectionService.selection as SelectableTreeNode[]) : [node];
        selection.forEach(n => this.removeNode(n));
        e.stopPropagation();
    }

    protected renderRemoveButton(node: TreeNode): React.ReactNode {
        return <span className={codicon('close')} onClick={e => this.remove(node, e)} title='Dismiss'></span>;
    }

    removeNode(node: TreeNode): void {
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

    private findEndCharacterPosition(node: SearchInWorkspaceResultLineNode): Position {
        const lineText = typeof node.lineText === 'string' ? node.lineText : node.lineText.text;
        const lines = lineText.split('\n');
        const line = node.line + lines.length - 2;
        let character = node.character - 1 + node.length;
        if (lines.length > 1) {
            character = node.length - lines[0].length + node.character - lines.length;
            if (lines.length > 2) {
                for (const lineNum of Array(lines.length - 2).keys()) {
                    character -= lines[lineNum + 1].length;
                }
            }
        }

        return { line, character };
    }

    protected renderRootFolderNode(node: SearchInWorkspaceRootFolderNode): React.ReactNode {
        return <div className='result'>
            <div className='result-head'>
                <div className={`result-head-info noWrapInfo noselect ${node.selected ? 'selected' : ''}`}>
                    <span className={`file-icon ${this.toNodeIcon(node) || ''}`}></span>
                    <div className='noWrapInfo'>
                        <span className={'file-name'}>
                            {this.toNodeName(node)}
                        </span>
                        {node.path !== '/' + this.defaultRootName &&
                            <span className={'file-path ' + TREE_NODE_INFO_CLASS}>
                                {node.path}
                            </span>
                        }
                    </div>
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
        return <div className='result'>
            <div className='result-head'>
                <div className={`result-head-info noWrapInfo noselect ${node.selected ? 'selected' : ''}`}
                    title={new URI(node.fileUri).path.fsPath()}>
                    <span className={`file-icon ${this.toNodeIcon(node)}`}></span>
                    <div className='noWrapInfo'>
                        <span className={'file-name'}>
                            {this.toNodeName(node)}
                        </span>
                        <span className={'file-path ' + TREE_NODE_INFO_CLASS}>
                            {node.path}
                        </span>
                    </div>
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
        const character = typeof node.lineText === 'string' ? node.character : node.lineText.character;
        const lineText = typeof node.lineText === 'string' ? node.lineText : node.lineText.text;
        let start = Math.max(0, character - 26);
        const wordBreak = /\b/g;
        while (start > 0 && wordBreak.test(lineText) && wordBreak.lastIndex < character) {
            if (character - wordBreak.lastIndex < 26) {
                break;
            }
            start = wordBreak.lastIndex;
            wordBreak.lastIndex++;
        }

        const before = lineText.slice(start, character - 1).trimStart();
        const lineCount = lineText.split('\n').length;

        return <>
            <div className={`resultLine noWrapInfo noselect ${node.selected ? 'selected' : ''}`} title={lineText.trim()}>
                {this.searchInWorkspacePreferences['search.lineNumbers'] && <span className='theia-siw-lineNumber'>{node.line}</span>}
                <span>
                    {before}
                </span>
                {this.renderMatchLinePart(node)}
                {lineCount > 1 || <span>
                    {lineText.slice(node.character + node.length - 1, 250 - before.length + node.length)}
                </span>}
            </div>
            {lineCount > 1 && <div className='match-line-num'>+{lineCount - 1}</div>}
        </>;
    }

    protected renderMatchLinePart(node: SearchInWorkspaceResultLineNode): React.ReactNode {
        const replaceTermLines = this._replaceTerm.split('\n');
        const replaceTerm = this.isReplacing ? <span className='replace-term'>{replaceTermLines[0]}</span> : '';
        const className = `match${this.isReplacing ? ' strike-through' : ''}`;
        const text = typeof node.lineText === 'string' ? node.lineText : node.lineText.text;
        const match = text.substring(node.character - 1, node.character + node.length - 1);
        const matchLines = match.split('\n');
        return <React.Fragment>
            <span className={className}>{matchLines[0]}</span>
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

    protected async doOpen(node: SearchInWorkspaceResultLineNode, asDiffWidget = false, preview = false): Promise<EditorWidget> {
        let fileUri: URI;
        const resultNode = node.parent;
        if (resultNode && this.isReplacing && asDiffWidget) {
            const leftUri = new URI(node.fileUri);
            const rightUri = await this.createReplacePreview(resultNode);
            fileUri = DiffUris.encode(leftUri, rightUri);
        } else {
            fileUri = new URI(node.fileUri);
        }

        const opts: EditorOpenerOptions = {
            selection: {
                start: {
                    line: node.line - 1,
                    character: node.character - 1
                },
                end: this.findEndCharacterPosition(node),
            },
            mode: preview ? 'reveal' : 'activate',
            preview,
        };

        const editorWidget = await this.editorManager.open(fileUri, opts);

        if (!DiffUris.isDiffUri(fileUri)) {
            this.decorateEditor(resultNode, editorWidget);
        }

        return editorWidget;
    }

    protected async createReplacePreview(node: SearchInWorkspaceFileNode): Promise<URI> {
        const fileUri = new URI(node.fileUri).withScheme('file');
        const openedEditor = this.editorManager.all.find(({ editor }) => editor.uri.toString() === fileUri.toString());
        let content: string;
        if (openedEditor) {
            content = openedEditor.editor.document.getText();
        } else {
            const resource = await this.fileResourceResolver.resolve(fileUri);
            content = await resource.readContents();
        }

        const searchTermRegExp = new RegExp(this.searchTerm, 'g');
        return fileUri.withScheme(MEMORY_TEXT).withQuery(content.replace(searchTermRegExp, this._replaceTerm));
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
            resultNode.children.forEach(res => {
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
                            color: {
                                id: 'editor.findMatchHighlightBackground'
                            },
                            position: OverviewRulerLane.Center
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
     * Get the list of exclude globs.
     * @param excludeOptions the exclude search option.
     *
     * @returns the list of exclude globs.
     */
    protected getExcludeGlobs(excludeOptions?: string[]): string[] {
        const excludePreferences = this.filesystemPreferences['files.exclude'];
        const excludePreferencesGlobs = Object.keys(excludePreferences).filter(key => !!excludePreferences[key]);
        return [...new Set([...excludePreferencesGlobs, ...excludeOptions || []])];
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

    /**
     * @param recursive if true, all child nodes will be included in the stringified result.
     */
    nodeToString(node: TreeNode, recursive: boolean): string {
        if (SearchInWorkspaceFileNode.is(node) || SearchInWorkspaceRootFolderNode.is(node)) {
            if (recursive) {
                return this.nodeIteratorToString(new TopDownTreeIterator(node, { pruneSiblings: true }));
            }
            return this.labelProvider.getLongName(node.uri);
        }
        if (SearchInWorkspaceResultLineNode.is(node)) {
            return `  ${node.line}:${node.character}: ${node.lineText}`;
        }
        return '';
    }

    treeToString(): string {
        return this.nodeIteratorToString(this.getVisibleNodes());
    }

    protected *getVisibleNodes(): IterableIterator<TreeNode> {
        for (const { node } of this.rows.values()) {
            yield node;
        }
    }

    protected nodeIteratorToString(nodes: Iterable<TreeNode>): string {
        const strings = [];
        for (const node of nodes) {
            const string = this.nodeToString(node, false);
            if (string.length !== 0) {
                strings.push(string);
            }
        }
        return strings.join(EOL);
    }
}

export namespace SearchInWorkspaceResultTreeWidget {
    export namespace Menus {
        export const BASE = ['siw-tree-context-menu'];
        /** Dismiss command, or others that only affect the widget itself */
        export const INTERNAL = [...BASE, '1_internal'];
        /** Copy a stringified representation of content */
        export const COPY = [...BASE, '2_copy'];
        /** Commands that lead out of the widget, like revealing a file in the navigator */
        export const EXTERNAL = [...BASE, '3_external'];
    }
}
