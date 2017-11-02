/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import SymbolInformation = monaco.modes.SymbolInformation;
import SymbolKind = monaco.modes.SymbolKind;
import { FrontendApplicationContribution, FrontendApplication, ITreeNode } from "@theia/core/lib/browser";
import { Range, EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import DocumentSymbolProviderRegistry = monaco.modes.DocumentSymbolProviderRegistry;
import CancellationTokenSource = monaco.cancellation.CancellationTokenSource;
import { DisposableCollection } from "@theia/core";
import { OutlineViewService, OutlineSymbolInformationNode } from "@theia/outline-view/lib/browser/outline-view-service";
import URI from "@theia/core/lib/common/uri";
import { get } from './monaco-editor';

@injectable()
export class MonacoOutlineContribution implements FrontendApplicationContribution {

    protected ids: string[] = [];
    protected symbolList: NodeAndSymbol[] = [];
    protected readonly toDispose = new DisposableCollection();
    protected readonly outlineSymbolInformations: MonacoOutlineSymbolInformationNode[];
    protected cancellationSource: CancellationTokenSource;

    constructor(
        @inject(OutlineViewService) protected readonly outlineViewManager: OutlineViewService,
        @inject(EditorManager) protected readonly editorManager: EditorManager) { }

    onStart(app: FrontendApplication): void {
        this.outlineViewManager.onDidChangeOpenState(async isOpen => {
            this.updateOutline();
        });
        // let's skip the initial current Editor change event, as on reload it comes before the language sevrers have started,
        // resulting in an empty outline.
        setTimeout(() => {
            this.editorManager.onCurrentEditorChanged(async editor => {
                this.updateOutlineForEditor(editor);
            });
        }, 1000);

        DocumentSymbolProviderRegistry.onDidChange(event => {
            this.updateOutline();
        });

        this.outlineViewManager.onDidSelect(async node => {
            if (MonacoOutlineSymbolInformationNode.is(node) && node.parent) {
                let widget = this.editorManager.editors.find(editor => editor.editor.uri.toString() === node.uri);
                if (!widget) {
                    widget = await this.editorManager.open(new URI(node.uri));
                }
                widget.editor.selection = node.range;
                widget.editor.revealRange(node.range);
            }
        });

        this.outlineViewManager.onDidOpen(node => {
            if (MonacoOutlineSymbolInformationNode.is(node)) {
                this.editorManager.open(new URI(node.uri), {
                    selection: <Range>{
                        start: node.range.start
                    }
                });
            }
        });
    }

    protected updateOutline() {
        const editor = this.editorManager.currentEditor;
        if (editor) {
            this.updateOutlineForEditor(editor);
        }
    }

    protected async updateOutlineForEditor(editor: EditorWidget | undefined) {
        if (this.outlineViewManager.open) {
            if (editor) {
                const model = await this.getModel(editor);
                this.publish(await this.computeSybolInformations(model));
            } else {
                this.publish([]);
            }
        }
    }

    protected async getModel(editor: EditorWidget): Promise<monaco.editor.IModel> {
        const monacoEditor = get(editor);
        const model = monacoEditor!.getControl().getModel();
        this.toDispose.dispose();
        this.toDispose.push(model.onDidChangeContent(async ev => {
            this.publish(await this.computeSybolInformations(model));
        }));
        return model;
    }

    protected async computeSybolInformations(model: monaco.editor.IModel): Promise<SymbolInformation[]> {
        const entries: SymbolInformation[] = [];

        const documentSymbolProviders = await DocumentSymbolProviderRegistry.all(model);

        if (this.cancellationSource) {
            this.cancellationSource.cancel();
        }
        this.cancellationSource = new CancellationTokenSource();
        for (const documentSymbolProvider of documentSymbolProviders) {
            const symbolInformation = await documentSymbolProvider.provideDocumentSymbols(model, this.cancellationSource.token);
            entries.push(...symbolInformation);
        }

        return entries;
    }

    protected publish(entries: SymbolInformation[]) {
        let outlineSymbolInformations: OutlineSymbolInformationNode[] = [];
        this.ids = [];
        this.symbolList = [];
        outlineSymbolInformations = this.createTree(undefined, entries);
        this.outlineViewManager.publish(outlineSymbolInformations);
    }

    getRangeFromSymbolInformation(symbolInformation: SymbolInformation): Range {
        return {
            end: {
                character: symbolInformation.location.range.endColumn - 1,
                line: symbolInformation.location.range.endLineNumber - 1
            },
            start: {
                character: symbolInformation.location.range.startColumn - 1,
                line: symbolInformation.location.range.startLineNumber - 1
            }
        };
    }

    getId(name: string, counter: number): string {
        let uniqueId: string = name + counter;
        if (this.ids.find(id => id === uniqueId)) {
            uniqueId = this.getId(name, ++counter);
        }
        return uniqueId;
    }

    protected convertToNode(symbol: SymbolInformation, parent: NodeAndSymbol | undefined): NodeAndSymbol {
        const id = this.getId(symbol.name, 0);
        this.ids.push(id);
        const node: MonacoOutlineSymbolInformationNode = {
            children: [],
            id,
            iconClass: SymbolKind[symbol.kind].toString().toLowerCase(),
            name: symbol.name,
            parent: parent ? parent.node : undefined,
            selected: false,
            expanded: true,
            uri: symbol.location.uri.toString(),
            range: this.getRangeFromSymbolInformation(symbol)
        };
        const symbolAndNode = { node, symbol };
        this.symbolList.push(symbolAndNode);
        return symbolAndNode;
    }

    protected createTree(parentNode: NodeAndSymbol | undefined, symbolInformationList: SymbolInformation[]): OutlineSymbolInformationNode[] {
        const childNodes: NodeAndSymbol[] =
            symbolInformationList
                // filter children
                .filter(sym => {
                    if (parentNode) {
                        const symRange = this.getRangeFromSymbolInformation(sym);
                        const nodeRange = this.getRangeFromSymbolInformation(parentNode.symbol);
                        const nodeIsContainer = sym.containerName === parentNode.symbol.name;
                        const sameStartLine = symRange.start.line === nodeRange.start.line;
                        const startColGreaterOrEqual = symRange.start.character >= nodeRange.start.character;
                        const startLineGreater = symRange.start.line > nodeRange.start.line;
                        const sameEndLine = symRange.end.line === nodeRange.end.line;
                        const endColSmallerOrEqual = symRange.end.character <= nodeRange.end.character;
                        const endLineSmaller = symRange.end.line < nodeRange.end.line;
                        return nodeIsContainer &&
                            ((sameStartLine && startColGreaterOrEqual) || (startLineGreater)) &&
                            ((sameEndLine && endColSmallerOrEqual) || (endLineSmaller));
                    } else {
                        return !sym.containerName;
                    }
                })
                // create array of children as nodes
                .map(sym => this.convertToNode(sym, parentNode));
        childNodes.forEach(
            childNode =>
                childNode.node.children = this.createTree(
                    childNode,
                    symbolInformationList.filter(s => childNode.symbol !== s)
                )
        );
        return childNodes.map(n => n.node);
    }

    protected getSymbolInformationByNode(node: OutlineSymbolInformationNode): SymbolInformation | undefined {
        const nodeAndSymbol = this.symbolList.find(s => s.node.id === node.id);
        if (nodeAndSymbol) {
            return nodeAndSymbol.symbol;
        }
        return undefined;
    }
}

export interface MonacoOutlineSymbolInformationNode extends OutlineSymbolInformationNode {
    uri: string;
    range: Range;
}

export namespace MonacoOutlineSymbolInformationNode {
    export function is(node: ITreeNode): node is MonacoOutlineSymbolInformationNode {
        return OutlineSymbolInformationNode.is(node) && 'uri' in node && 'range' in node;
    }
}

export interface NodeAndSymbol {
    node: OutlineSymbolInformationNode;
    symbol: SymbolInformation
}
