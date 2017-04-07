import * as is from 'vscode-languageclient/lib/utils/is';
import { TextDocumentPositionParams } from 'vscode-languageclient/lib/protocol';
import { Position, TextDocumentIdentifier, CompletionItem, CompletionList, InsertTextFormat, Range, Diagnostic } from 'vscode-languageserver-types';
import IReadOnlyModel = monaco.editor.IReadOnlyModel;
import languages = monaco.languages;

export interface ProtocolCompletionItem extends languages.CompletionItem {
    data?: any;
    fromEdit?: boolean;
}

export namespace m2p {
    export function asPosition(lineNumber: number, column: number): Position {
        return Position.create(lineNumber - 1, column - 1)
    }

    export function asRange(range: undefined): undefined;
    export function asRange(range: null): null;
    export function asRange(range: monaco.IRange): Range;
    export function asRange(range: monaco.IRange | undefined  | null): Range | undefined | null {
        if (range === undefined) {
            return undefined
        }

        if (!range) {
            return null
        }

        return Range.create(
            asPosition(range.startLineNumber, range.startColumn),
            asPosition(range.endLineNumber, range.endColumn)
        )
    }

    export function asTextDocumentIdentifier(model: IReadOnlyModel): TextDocumentIdentifier {
        return {
            uri: model.uri.toString()
        }
    }

    export function asTextDocumentPositionParams(model: IReadOnlyModel, position: monaco.Position): TextDocumentPositionParams {
        return {
            textDocument: asTextDocumentIdentifier(model),
            position: asPosition(position.lineNumber, position.column)
        };
    }
}

export namespace p2m {

    export function asSeverity(severity?: number): monaco.Severity {
        if (severity === 1) {
            return monaco.Severity.Error;
        }
        if (severity === 2) {
            return monaco.Severity.Warning;
        }
        if (severity === 3) {
            return monaco.Severity.Info;
        }
        return monaco.Severity.Ignore;
    }

    export function asMarker(diagnostic: Diagnostic): monaco.editor.IMarkerData {
        return {
            code: diagnostic.code as string,
            severity: asSeverity(diagnostic.severity),
            message: diagnostic.message,
            source: diagnostic.source,
            startLineNumber: diagnostic.range.start.line + 1,
            startColumn: diagnostic.range.start.character + 1,
            endLineNumber: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1
        }
    }

    export function asCompletionResult(result: CompletionItem[] | CompletionList | undefined): languages.CompletionItem[] | languages.CompletionList | undefined {
        if (!result) {
            return undefined;
        }
        if (Array.isArray(result)) {
            return result.map(asCompletionItem);
        }
        return <languages.CompletionList>{
            isIncomplete: result.isIncomplete,
            items: result.items.map(asCompletionItem)
        }
    }

    export function asCompletionItem(item: CompletionItem): ProtocolCompletionItem {
        const result = <ProtocolCompletionItem>{ label: item.label };
        if (item.detail) { result.detail = item.detail; }
        if (item.documentation) { result.documentation = item.documentation };
        if (item.filterText) { result.filterText = item.filterText; }
        let insertText = asCompletionInsertText(item);
        if (insertText) {
            result.insertText = insertText.text;
            result.range = insertText.range;
            result.fromEdit = insertText.fromEdit;
        }
        // Protocol item kind is 1 based, codes item kind is zero based.
        if (is.number(item.kind) && item.kind > 0) { result.kind = item.kind - 1; }
        if (item.sortText) { result.sortText = item.sortText; }
        // TODO: if (item.additionalTextEdits) { result.additionalTextEdits = asTextEdits(item.additionalTextEdits); }
        // TODO: if (item.command) { result.command = asCommand(item.command); }
        if (item.data !== void 0 && item.data !== null) { result.data = item.data; }
        return result;
    }

    export function asCompletionInsertText(item: CompletionItem): { text: string | languages.SnippetString, range?: monaco.Range, fromEdit: boolean } | undefined {
        if (item.textEdit) {
            const range = asRange(item.textEdit.range)!;
            const value = item.textEdit.newText;
            const text = item.insertTextFormat === InsertTextFormat.Snippet ? { value } : value;
            return {
                text, range, fromEdit: true
            };
        }
        if (item.insertText) {
            const value = item.insertText;
            const text = item.insertTextFormat === InsertTextFormat.Snippet ? { value } : value;
            return { text, fromEdit: false };
        }
        return undefined;
    }

    export function asRange(range: Range | undefined | null): monaco.Range | undefined | null {
        if (range === undefined) {
            return undefined;
        }
        if (!range) {
            return null;
        }
        return new monaco.Range(
            range.start.line + 1,
            range.start.character + 1,
            range.end.line + 1,
            range.end.character + 1
        );
    }

}
