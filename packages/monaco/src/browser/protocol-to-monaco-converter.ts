// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { Position, Range, Location, TextEdit, Diagnostic, DiagnosticRelatedInformation } from '@theia/core/shared/vscode-languageserver-protocol';
import { RecursivePartial } from '@theia/core/lib/common/types';
import { Range as MonacoRange, IRange, Position as MonacoPosition, languages, IPosition, MarkerSeverity, editor, Uri } from 'monaco-editor-core';

@injectable()
export class ProtocolToMonacoConverter {

    asRange(range: undefined): undefined;
    asRange(range: Range): MonacoRange;
    asRange(range: Range | undefined): MonacoRange | undefined;
    asRange(range: RecursivePartial<Range>): Partial<IRange>;
    asRange(range: RecursivePartial<Range> | undefined): MonacoRange | Partial<IRange> | undefined;
    asRange(range: RecursivePartial<Range> | undefined): MonacoRange | Partial<IRange> | undefined {
        if (range === undefined) {
            return undefined;
        }
        const start = this.asPosition(range.start);
        const end = this.asPosition(range.end);
        if (start instanceof MonacoPosition && end instanceof MonacoPosition) {
            return new MonacoRange(start.lineNumber, start.column, end.lineNumber, end.column);
        }
        const startLineNumber = !start || start.lineNumber === undefined ? undefined : start.lineNumber;
        const startColumn = !start || start.column === undefined ? undefined : start.column;
        const endLineNumber = !end || end.lineNumber === undefined ? undefined : end.lineNumber;
        const endColumn = !end || end.column === undefined ? undefined : end.column;
        return { startLineNumber, startColumn, endLineNumber, endColumn };
    }

    asPosition(position: undefined): undefined;
    asPosition(position: Position): MonacoPosition;
    asPosition(position: Position | undefined): MonacoPosition | undefined;
    asPosition(position: Partial<Position>): Partial<IPosition>;
    asPosition(position: Partial<Position> | undefined): MonacoPosition | Partial<IPosition> | undefined;
    asPosition(position: Partial<Position> | undefined): MonacoPosition | Partial<IPosition> | undefined {
        if (position === undefined) {
            return undefined;
        }
        const { line, character } = position;
        const lineNumber = line === undefined ? undefined : line + 1;
        const column = character === undefined ? undefined : character + 1;
        if (lineNumber !== undefined && column !== undefined) {
            return new MonacoPosition(lineNumber, column);
        }
        return { lineNumber, column };
    }

    asLocation(item: Location): languages.Location;
    asLocation(item: undefined): undefined;
    asLocation(item: Location | undefined): languages.Location | undefined;
    asLocation(item: Location | undefined): languages.Location | undefined {
        if (!item) {
            return undefined;
        }
        const uri = Uri.parse(item.uri);
        const range = this.asRange(item.range)!;
        return {
            uri, range
        };
    }

    asTextEdit(edit: TextEdit): languages.TextEdit;
    asTextEdit(edit: undefined): undefined;
    asTextEdit(edit: TextEdit | undefined): undefined;
    asTextEdit(edit: TextEdit | undefined): languages.TextEdit | undefined {
        if (!edit) {
            return undefined;
        }
        const range = this.asRange(edit.range)!;
        return {
            range,
            text: edit.newText
        };
    }

    asTextEdits(items: TextEdit[]): languages.TextEdit[];
    asTextEdits(items: undefined): undefined;
    asTextEdits(items: TextEdit[] | undefined): languages.TextEdit[] | undefined;
    asTextEdits(items: TextEdit[] | undefined): languages.TextEdit[] | undefined {
        if (!items) {
            return undefined;
        }
        return items.map(item => this.asTextEdit(item));
    }

    asSeverity(severity?: number): MarkerSeverity {
        if (severity === 1) {
            return MarkerSeverity.Error;
        }
        if (severity === 2) {
            return MarkerSeverity.Warning;
        }
        if (severity === 3) {
            return MarkerSeverity.Info;
        }
        return MarkerSeverity.Hint;
    }

    asDiagnostics(diagnostics: undefined): undefined;
    asDiagnostics(diagnostics: Diagnostic[]): editor.IMarkerData[];
    asDiagnostics(diagnostics: Diagnostic[] | undefined): editor.IMarkerData[] | undefined;
    asDiagnostics(diagnostics: Diagnostic[] | undefined): editor.IMarkerData[] | undefined {
        if (!diagnostics) {
            return undefined;
        }
        return diagnostics.map(diagnostic => this.asDiagnostic(diagnostic));
    }

    asDiagnostic(diagnostic: Diagnostic): editor.IMarkerData {
        return {
            code: typeof diagnostic.code === 'number' ? diagnostic.code.toString() : diagnostic.code,
            severity: this.asSeverity(diagnostic.severity),
            message: diagnostic.message,
            source: diagnostic.source,
            startLineNumber: diagnostic.range.start.line + 1,
            startColumn: diagnostic.range.start.character + 1,
            endLineNumber: diagnostic.range.end.line + 1,
            endColumn: diagnostic.range.end.character + 1,
            relatedInformation: this.asRelatedInformations(diagnostic.relatedInformation),
            tags: diagnostic.tags
        };
    }

    asRelatedInformations(relatedInformation?: DiagnosticRelatedInformation[]): editor.IRelatedInformation[] | undefined {
        if (!relatedInformation) {
            return undefined;
        }
        return relatedInformation.map(item => this.asRelatedInformation(item));
    }

    asRelatedInformation(relatedInformation: DiagnosticRelatedInformation): editor.IRelatedInformation {
        return {
            resource: Uri.parse(relatedInformation.location.uri),
            startLineNumber: relatedInformation.location.range.start.line + 1,
            startColumn: relatedInformation.location.range.start.character + 1,
            endLineNumber: relatedInformation.location.range.end.line + 1,
            endColumn: relatedInformation.location.range.end.character + 1,
            message: relatedInformation.message
        };
    }

}
