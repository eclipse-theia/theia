/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    TreeWidget,
    ContextMenuRenderer,
    CompositeTreeNode,
    ExpandableTreeNode,
    SelectableTreeNode,
    TreeModel,
    TreeNode,
    NodeProps,
    LabelProvider,
    TreeExpansionService,
    ApplicationShell,
    DiffUris
} from "@theia/core/lib/browser";
import { SearchInWorkspaceResult, SearchInWorkspaceOptions } from "../common/search-in-workspace-interface";
import { SearchInWorkspaceService } from "./search-in-workspace-service";
import { TreeProps } from "@theia/core/lib/browser";
import { EditorManager, EditorDecoration, TrackedRangeStickiness, OverviewRulerLane, EditorWidget, ReplaceOperation } from "@theia/editor/lib/browser";
import { inject, injectable, postConstruct } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { Path, CancellationTokenSource, Emitter, Event } from "@theia/core";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { h } from "@phosphor/virtualdom";
import { MEMORY_TEXT } from "./in-memory-text-resource";
import { FileResourceResolver } from "@theia/filesystem/lib/browser";

export interface SearchInWorkspaceResultNode extends ExpandableTreeNode, SelectableTreeNode {
    children: SearchInWorkspaceResultLineNode[];
    path: string;
    file: string;
}
export namespace SearchInWorkspaceResultNode {
    export function is(node: any): node is SearchInWorkspaceResultNode {
        return ExpandableTreeNode.is(node) && SelectableTreeNode.is(node) && "path" in node;
    }
}

export type SearchInWorkspaceResultLineNode = SelectableTreeNode & SearchInWorkspaceResult;
export namespace SearchInWorkspaceResultLineNode {
    export function is(node: any): node is SearchInWorkspaceResultLineNode {
        return SelectableTreeNode.is(node) && "line" in node && "character" in node && "lineText" in node;
    }
}

@injectable()
export class SearchInWorkspaceResultTreeWidget extends TreeWidget {

    protected resultTree: Map<string, SearchInWorkspaceResultNode>;
    protected workspaceRoot: string = "";

    protected _showReplaceButtons = false;
    protected _replaceTerm = "";
    protected searchTerm = "";

    protected appliedDecorations = new Map<string, string[]>();

    private cancelIndicator = new CancellationTokenSource();

    protected changeEmitter: Emitter<Map<string, SearchInWorkspaceResultNode>>;

    @inject(SearchInWorkspaceService) protected readonly searchService: SearchInWorkspaceService;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(FileResourceResolver) protected readonly fileResourceResolver: FileResourceResolver;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(TreeExpansionService) protected readonly expansionService: TreeExpansionService;

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(TreeModel) readonly model: TreeModel,
        @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);

        model.root = <CompositeTreeNode>{
            id: "ResultTree",
            name: "ResultTree",
            parent: undefined,
            visible: false,
            children: []
        };

        this.toDispose.push(model.onSelectionChanged(nodes => {
            const node = nodes[0];
            if (SearchInWorkspaceResultLineNode.is(node)) {
                this.doOpen(node, true);
            }
        }));

        this.toDispose.push(model.onNodeRefreshed(() => this.changeEmitter.fire(this.resultTree)));
    }

    @postConstruct()
    protected init() {
        this.addClass("resultContainer");

        this.workspaceService.root.then(rootFileStat => {
            if (rootFileStat) {
                const uri = new URI(rootFileStat.uri);
                this.workspaceRoot = uri.withoutScheme().toString();
            }
        });

        this.changeEmitter = new Emitter();

        this.toDispose.push(this.editorManager.onActiveEditorChanged(() => {
            this.updateCurrentEditorDecorations();
        }));
    }

    set showReplaceButtons(srb: boolean) {
        this._showReplaceButtons = srb;
        this.update();
    }

    set replaceTerm(rt: string) {
        this._replaceTerm = rt;
        this.update();
    }

    get onChange(): Event<Map<string, SearchInWorkspaceResultNode>> {
        return this.changeEmitter.event;
    }

    collapseAll() {
        this.resultTree.forEach(v => this.expansionService.collapseNode(v));
    }

    async search(searchTerm: string, searchOptions: SearchInWorkspaceOptions): Promise<void> {
        this.searchTerm = searchTerm;
        this.resultTree = new Map<string, SearchInWorkspaceResultNode>();
        if (searchTerm === "") {
            this.refreshModelChildren();
            return;
        }
        this.cancelIndicator.cancel();
        this.cancelIndicator = new CancellationTokenSource();
        const token = this.cancelIndicator.token;
        const searchId = await this.searchService.search(searchTerm, {
            onResult: async (aSearchId: number, result: SearchInWorkspaceResult) => {
                if (token.isCancellationRequested || aSearchId !== searchId) {
                    return;
                }
                const { name, path } = this.filenameAndPath(result.file);
                let resultElement = this.resultTree.get(result.file);

                if (resultElement) {
                    const resultLine = this.createResultLineNode(result, resultElement);
                    resultElement.children.push(resultLine);
                } else {
                    const children: SearchInWorkspaceResultLineNode[] = [];
                    const icon = await this.labelProvider.getIcon(new URI(result.file));
                    if (CompositeTreeNode.is(this.model.root)) {
                        resultElement = {
                            selected: false,
                            name,
                            path,
                            children,
                            expanded: true,
                            id: path + "-" + name,
                            parent: this.model.root,
                            icon,
                            file: result.file
                        };
                        resultElement.children.push(this.createResultLineNode(result, resultElement));
                        this.resultTree.set(result.file, resultElement);
                    }
                }
            },
            onDone: () => {
                if (token.isCancellationRequested) {
                    return;
                }
                this.refreshModelChildren();
            }
        }, searchOptions);
        token.onCancellationRequested(() => {
            this.searchService.cancel(searchId);
        });
    }

    protected refreshModelChildren() {
        if (CompositeTreeNode.is(this.model.root)) {
            this.model.root.children = Array.from(this.resultTree.values());
            this.model.refresh();
            this.updateCurrentEditorDecorations();
        }
    }

    protected updateCurrentEditorDecorations() {
        this.shell.allTabBars.map(tb => {
            const currentTitle = tb.currentTitle;
            if (currentTitle && currentTitle.owner instanceof EditorWidget) {
                const widget = currentTitle.owner;
                const result = this.resultTree.get(widget.editor.uri.withoutScheme().toString());
                this.decorateEditor(result, widget);
            }
        });

        const currentWidget = this.editorManager.currentEditor;
        if (currentWidget) {
            const result = this.resultTree.get(currentWidget.editor.uri.withoutScheme().toString());
            this.decorateEditor(result, currentWidget);
        }
    }

    protected createResultLineNode(result: SearchInWorkspaceResult, resultNode: SearchInWorkspaceResultNode): SearchInWorkspaceResultLineNode {
        return {
            ...result,
            selected: false,
            id: result.file + "-" + result.line + "-" + result.character + "-" + result.length,
            name: result.lineText,
            parent: resultNode
        };
    }

    protected filenameAndPath(uriStr: string): { name: string, path: string } {
        const uri: URI = new URI(uriStr);
        const name = uri.displayName;
        const path = new Path(uri.toString().substr(this.workspaceRoot.length + 1)).dir.toString();
        return { name, path };
    }

    protected renderCaption(node: TreeNode, props: NodeProps): h.Child {
        if (SearchInWorkspaceResultNode.is(node)) {
            return this.renderResultNode(node);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            return this.renderResultLineNode(node);
        }
        return "";
    }

    protected renderTailDecorations(node: TreeNode, props: NodeProps): h.Child[] {
        const btns: h.Child[] = [];
        if (this._showReplaceButtons) {
            btns.push(this.renderReplaceButton(node));
        }
        btns.push(this.renderRemoveButton(node));
        return [h.div({ className: "result-node-buttons" }, ...btns)];
    }

    protected renderReplaceButton(node: TreeNode): h.Child {
        return h.span({
            className: "replace-result",
            onclick: async e => {
                this.replaceResult(node);
                this.removeNode(node);
                e.stopPropagation();
            }
        });
    }

    replaceAll(): void {
        this.resultTree.forEach(async resultNode => {
            await this.replaceResult(resultNode);
        });
        this.resultTree.clear();
        this.refreshModelChildren();
    }

    protected updateRightResults(node: SearchInWorkspaceResultLineNode) {
        const result = this.resultTree.get(node.file);
        if (result) {
            const rightPositionedNodes = result.children.filter(rl => rl.line === node.line && rl.character > node.character);
            const diff = this._replaceTerm.length - this.searchTerm.length;
            rightPositionedNodes.map(r => r.character += diff);
        }
    }

    protected async replaceResult(node: TreeNode) {
        const toReplace: SearchInWorkspaceResultLineNode[] = [];
        if (SearchInWorkspaceResultNode.is(node)) {
            toReplace.push(...node.children);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            toReplace.push(node);
            this.updateRightResults(node);
        }

        if (toReplace.length > 0) {
            const widget = await this.doOpen(toReplace[0]);
            const source = widget.editor.document.getText();
            const replaceOperations = toReplace.map(resultLineNode => <ReplaceOperation>{
                text: this._replaceTerm,
                range: {
                    start: {
                        line: resultLineNode.line,
                        character: resultLineNode.character
                    },
                    end: {
                        line: resultLineNode.line,
                        character: resultLineNode.character + resultLineNode.length
                    }
                }
            });
            await widget.editor.replaceText({
                source,
                replaceOperations
            });
        }
    }

    protected renderRemoveButton(node: TreeNode): h.Child {
        return h.span({
            className: "remove-node", onclick: e => {
                this.removeNode(node);
                e.stopPropagation();
            }
        });
    }

    protected removeNode(node: TreeNode) {
        if (SearchInWorkspaceResultNode.is(node)) {
            this.resultTree.delete(node.file);
        } else if (SearchInWorkspaceResultLineNode.is(node)) {
            const result = this.resultTree.get(node.file);
            if (result) {
                const index = result.children.findIndex(n => n.file === node.file && n.line === node.line && n.character === node.character);
                if (index > -1) {
                    result.children.splice(index, 1);
                    if (result.children.length === 0) {
                        this.resultTree.delete(result.file);
                    }
                }
            }
        }
        this.refreshModelChildren();
    }

    protected renderResultNode(node: SearchInWorkspaceResultNode): h.Child {
        const icon = node.icon;
        const fileIcon = h.span({ className: `file-icon ${icon || ""}` });
        const fileName = h.span({ className: "file-name" }, node.name);
        const filePath = h.span({ className: "file-path" }, node.path);
        const resultNumber = h.span({ className: "result-number" }, node.children.length.toString());
        const resultHeadInfo = h.div(
            { className: `result-head-info noWrapInfo noselect ${node.selected ? 'selected' : ''}` },
            fileIcon, fileName, filePath);
        const resultHead = h.div({ className: "result-head" }, resultHeadInfo, resultNumber);
        return h.div({ className: "result" }, resultHead);
    }

    protected renderResultLineNode(node: SearchInWorkspaceResultLineNode): h.Child {
        const prefix = node.character > 26 ? '... ' : '';
        const start = h.span(prefix + node.lineText.substr(0, node.character - 1).substr(-25));
        const match = this.renderMatchLinePart(node);
        const end = h.span(node.lineText.substr(node.character - 1 + node.length, 75));
        return h.div(
            {
                className: `resultLine noWrapInfo ${node.selected ? 'selected' : ''}`,
                onclick: () => this.model.selectNode(node)
            }, start, ...match, end);
    }

    protected renderMatchLinePart(node: SearchInWorkspaceResultLineNode): h.Child[] {
        const replaceTerm = this._replaceTerm !== "" && this._showReplaceButtons ? h.span({ className: "replace-term" }, this._replaceTerm) : "";
        const className = `match${this._showReplaceButtons ? " strike-through" : ""}`;
        return [h.span({ className }, node.lineText.substr(node.character - 1, node.length)), replaceTerm];
    }

    protected async doOpen(node: SearchInWorkspaceResultLineNode, preview: boolean = false): Promise<EditorWidget> {
        let fileUri: URI;
        const resultNode = this.resultTree.get(node.file);
        if (resultNode && this._showReplaceButtons && preview) {
            const leftUri = new URI(node.file).withScheme("file");
            const rightUri = await this.createReplacePreview(resultNode);
            fileUri = DiffUris.encode(leftUri, rightUri);
        } else {
            fileUri = new URI(node.file).withScheme("file");
        }
        const editorWidget = await this.editorManager.open(fileUri, {
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
            mode: "reveal"
        });

        this.decorateEditor(resultNode, editorWidget);

        return editorWidget;
    }

    protected async createReplacePreview(node: SearchInWorkspaceResultNode): Promise<URI> {
        const fileUri = new URI(node.file).withScheme("file");
        const uri = fileUri.withoutScheme().toString();
        const resource = await this.fileResourceResolver.resolve(fileUri);
        const content = await resource.readContents();

        const lines = content.split("\n");
        node.children.map(l => {
            const leftPositionedNodes = node.children.filter(rl => rl.line === l.line && rl.character < l.character);
            const diff = (this._replaceTerm.length - this.searchTerm.length) * leftPositionedNodes.length;
            const start = lines[l.line - 1].substr(0, l.character - 1 + diff);
            const end = lines[l.line - 1].substr(l.character - 1 + diff + l.length);
            lines[l.line - 1] = start + this._replaceTerm + end;
        });

        return new URI(uri).withScheme(MEMORY_TEXT).withQuery(lines.join("\n"));
    }

    protected decorateEditor(node: SearchInWorkspaceResultNode | undefined, editorWidget: EditorWidget) {
        const key = `${editorWidget.editor.uri.toString()}#search-in-workspace-matches`;
        const oldDecorations = this.appliedDecorations.get(key) || [];
        const newDecorations = this.createEditorDecorations(node);
        const appliedDecorations = editorWidget.editor.deltaDecorations({
            newDecorations,
            oldDecorations,
            uri: editorWidget.editor.uri.toString()
        });
        this.appliedDecorations.set(key, appliedDecorations);
    }

    protected createEditorDecorations(resultNode: SearchInWorkspaceResultNode | undefined): EditorDecoration[] {
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
                            color: "rgba(230, 0, 0, 1)",
                            position: OverviewRulerLane.Full
                        },
                        className: res.selected ? "current-search-in-workspace-editor-match" : "search-in-workspace-editor-match",
                        stickiness: TrackedRangeStickiness.GrowsOnlyWhenTypingBefore
                    }
                });
            });
        }
        return decorations;
    }
}
