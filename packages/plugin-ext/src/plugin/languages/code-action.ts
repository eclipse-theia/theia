/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import URI from 'vscode-uri/lib/umd';
import { Selection } from '../../api/plugin-api';
import { Range } from '../../api/model';
import * as Converter from '../type-converters';
import { createToken } from '../token-provider';
import { DocumentsExtImpl } from '../documents';
import { Diagnostics } from './diagnostics';
import { CodeActionKind } from '../types-impl';

export class CodeActionAdapter {

    constructor(
        private readonly provider: theia.CodeActionProvider,
        private readonly document: DocumentsExtImpl,
        private readonly diagnostics: Diagnostics,
        private readonly pluginId: string
    ) { }

    provideCodeAction(resource: URI, rangeOrSelection: Range | Selection, context: monaco.languages.CodeActionContext): Promise<monaco.languages.CodeAction[]> {
        const document = this.document.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;
        const ran = CodeActionAdapter._isSelection(rangeOrSelection)
            ? <theia.Selection>Converter.toSelection(rangeOrSelection)
            : <theia.Range>Converter.toRange(rangeOrSelection);
        const allDiagnostics: theia.Diagnostic[] = [];

        for (const diagnostic of this.diagnostics.getDiagnostics(resource)) {
            if (ran.intersection(diagnostic.range)) {
                allDiagnostics.push(diagnostic);
            }
        }

        const codeActionContext: theia.CodeActionContext = {
            diagnostics: allDiagnostics,
            only: context.only ? new CodeActionKind(context.only) : undefined
        };

        return Promise.resolve(this.provider.provideCodeActions(doc, ran, codeActionContext, createToken())).then(commandsOrActions => {
            if (!Array.isArray(commandsOrActions) || commandsOrActions.length === 0) {
                return undefined!;
            }
            const result: monaco.languages.CodeAction[] = [];
            for (const candidate of commandsOrActions) {
                if (!candidate) {
                    continue;
                }
                if (CodeActionAdapter._isCommand(candidate)) {
                    result.push({
                        title: candidate.label || '',
                        command: Converter.toInternalCommand(candidate)
                    });
                } else {
                    if (codeActionContext.only) {
                        if (!candidate.kind) {
                            /* tslint:disable-next-line:max-line-length */
                            console.warn(`${this.pluginId} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
                        } else if (!codeActionContext.only.contains(candidate.kind)) {
                            /* tslint:disable-next-line:max-line-length */
                            console.warn(`${this.pluginId} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code action.`);
                        }
                    }

                    result.push({
                        title: candidate.title,
                        command: candidate.command && Converter.toInternalCommand(candidate.command),
                        diagnostics: candidate.diagnostics && candidate.diagnostics.map(Converter.convertDiagnosticToMarkerData) as monaco.editor.IMarker[],
                        edit: candidate.edit && Converter.fromWorkspaceEdit(candidate.edit) as monaco.languages.WorkspaceEdit,
                        kind: candidate.kind && candidate.kind.value
                    });
                }
            }

            return result;
        });

    }

    // tslint:disable-next-line:no-any
    private static _isCommand(smth: any): smth is theia.Command {
        return typeof (<theia.Command>smth).id === 'string';
    }

    // tslint:disable-next-line:no-any
    private static _isSelection(obj: any): obj is Selection {
        return (
            obj
            && (typeof obj.selectionStartLineNumber === 'number')
            && (typeof obj.selectionStartColumn === 'number')
            && (typeof obj.positionLineNumber === 'number')
            && (typeof obj.positionColumn === 'number')
        );
    }

}
