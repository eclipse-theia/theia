/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import SymbolInformation = monaco.modes.SymbolInformation;
import SymbolKind = monaco.modes.SymbolKind;
import { FrontendApplicationContribution, FrontendApplication, TreeNode } from "@theia/core/lib/browser";
import { Range, EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import DocumentSymbolProviderRegistry = monaco.modes.DocumentSymbolProviderRegistry;
import CancellationTokenSource = monaco.cancellation.CancellationTokenSource;
import { DisposableCollection } from "@theia/core";
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { OutlineSymbolInformationNode } from '@theia/outline-view/lib/browser/outline-view-widget';
import URI from "@theia/core/lib/common/uri";
import { MonacoEditor } from './monaco-editor';

import debounce = require('lodash.debounce');

@injectable()
export class MonacoOutlineContribution implements FrontendApplicationContribution {

    protected ids: string[] = [];
    protected symbolList: NodeAndSymbol[] = [];
    protected readonly outlineSymbolInformations: MonacoOutlineSymbolInformationNode[];
    protected cancellationSource: CancellationTokenSource;

    constructor(
        @inject(OutlineViewService) protected readonly outlineViewService: OutlineViewService,
        @inject(EditorManager) protected readonly editorManager: EditorManager) { }

    onStart(app: FrontendApplication): void {
        this.outlineViewService.onDidChangeOpenState(async isOpen => {
            this.updateOutline();
        });
        // let's skip the initial current Editor change event, as on reload it comes before the language server have started,
        // resulting in an empty outline.
        setTimeout(() => {
            this.editorManager.onCurrentEditorChanged(debounce(widget => this.updateOutlineForEditor(widget), 50));
        }, 3000);

        DocumentSymbolProviderRegistry.onDidChange(debounce(event => this.updateOutline()));

        this.outlineViewService.onDidSelect(async node => {
            if (MonacoOutlineSymbolInformationNode.is(node) && node.parent) {
                const uri = new URI(node.uri);
                await this.editorManager.open(uri, {
                    mode: 'reveal',
                    selection: node.range
                });
            }
        });

        this.outlineViewService.onDidOpen(node => {
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

    protected readonly toDisposeOnEditor = new DisposableCollection();
    protected async updateOutlineForEditor(editor: EditorWidget | undefined) {
        this.toDisposeOnEditor.dispose();
        if (editor) {
            const monacoEditor = MonacoEditor.get(editor);
            const model = monacoEditor!.getControl().getModel();
            this.toDisposeOnEditor.push(model.onDidChangeContent(async ev => {
                this.publish(await this.computeSymbolInformations(model));
            }));
            this.publish(await this.computeSymbolInformations(model));
        } else {
            this.publish([]);
        }
    }

    protected async computeSymbolInformations(model: monaco.editor.IModel): Promise<SymbolInformation[]> {
        const entries: SymbolInformation[] = [];
        const documentSymbolProviders = await DocumentSymbolProviderRegistry.all(model);

        if (this.cancellationSource) {
            this.cancellationSource.cancel();
        }
        this.cancellationSource = new CancellationTokenSource();
        const token = this.cancellationSource.token;
        for (const documentSymbolProvider of documentSymbolProviders) {
            try {
                const symbolInformation = await documentSymbolProvider.provideDocumentSymbols(model, token);
                if (token.isCancellationRequested) {
                    return [];
                }
                if (Array.isArray(symbolInformation)) {
                    entries.push(...symbolInformation);
                }
            } catch {
                // happens if `provideDocumentSymbols` promise is rejected.
                return [];
            }
        }

        return entries;
    }

    protected publish(entries: SymbolInformation[]) {
        let outlineSymbolInformations: OutlineSymbolInformationNode[] = [];
        this.ids = [];
        this.symbolList = [];
        outlineSymbolInformations = this.createTree(undefined, entries.sort(this.orderByPosition));
        this.outlineViewService.publish(outlineSymbolInformations);
    }

    protected getRangeFromSymbolInformation(symbolInformation: SymbolInformation): Range {
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

    protected getId(name: string, counter: number): string {
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
            uri: symbol.location.uri.toString(),
            range: this.getRangeFromSymbolInformation(symbol),
            selected: false,
            expanded: this.shouldExpand(symbol)
        };
        const symbolAndNode = { node, symbol };
        this.symbolList.push(symbolAndNode);
        return symbolAndNode;
    }

    protected shouldExpand(symbol: SymbolInformation): boolean {
        return [SymbolKind.Class,
        SymbolKind.Enum, SymbolKind.File,
        SymbolKind.Interface, SymbolKind.Module,
        SymbolKind.Namespace, SymbolKind.Object,
        SymbolKind.Package, SymbolKind.Struct].indexOf(symbol.kind) !== -1;
    }

    protected orderByPosition(symbol1: SymbolInformation, symbol2: SymbolInformation): number {
        const startLineComparison = symbol1.location.range.startLineNumber - symbol2.location.range.startLineNumber;
        if (startLineComparison !== 0) {
            return startLineComparison;
        }
        const startOffsetComparison = symbol1.location.range.startColumn - symbol2.location.range.startColumn;
        if (startOffsetComparison !== 0) {
            return startOffsetComparison;
        }
        const endLineComparison = symbol1.location.range.endLineNumber - symbol2.location.range.endLineNumber;
        if (endLineComparison !== 0) {
            return endLineComparison;
        }
        return symbol1.location.range.endColumn - symbol2.location.range.endColumn;
    }

    protected createTree(parentNode: NodeAndSymbol | undefined, symbolInformationList: SymbolInformation[]): OutlineSymbolInformationNode[] {
        const isRangeBased = symbolInformationList.find(s => s.location.range.startLineNumber !== s.location.range.endLineNumber) !== undefined;
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
                            (((sameStartLine && startColGreaterOrEqual || startLineGreater) &&
                                (sameEndLine && endColSmallerOrEqual || endLineSmaller)) || !isRangeBased);
                    } else {
                        return !sym.containerName || symbolInformationList[0] === sym;
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
    export function is(node: TreeNode): node is MonacoOutlineSymbolInformationNode {
        return OutlineSymbolInformationNode.is(node) && 'uri' in node && 'range' in node;
    }
}

export interface NodeAndSymbol {
    node: OutlineSymbolInformationNode;
    symbol: SymbolInformation
}
