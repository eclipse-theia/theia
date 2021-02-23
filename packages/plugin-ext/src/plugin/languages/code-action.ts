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
import { URI } from '@theia/core/shared/vscode-uri';
import { Selection } from '../../common/plugin-api-rpc';
import { Range, CodeActionContext, CodeAction } from '../../common/plugin-api-rpc-model';
import * as Converter from '../type-converters';
import { DocumentsExtImpl } from '../documents';
import { Diagnostics } from './diagnostics';
import { CodeActionKind } from '../types-impl';
import { CommandRegistryImpl } from '../command-registry';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

export class CodeActionAdapter {

    constructor(
        private readonly provider: theia.CodeActionProvider,
        private readonly document: DocumentsExtImpl,
        private readonly diagnostics: Diagnostics,
        private readonly pluginId: string,
        private readonly commands: CommandRegistryImpl
    ) { }

    async provideCodeAction(resource: URI, rangeOrSelection: Range | Selection,
        context: CodeActionContext, token: theia.CancellationToken): Promise<CodeAction[] | undefined> {
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

        const commandsOrActions = await this.provider.provideCodeActions(doc, ran, codeActionContext, token);

        if (!Array.isArray(commandsOrActions) || commandsOrActions.length === 0) {
            return undefined;
        }
        // TODO cache toDispose and dispose it
        const toDispose = new DisposableCollection();
        const result: CodeAction[] = [];
        for (const candidate of commandsOrActions) {
            if (!candidate) {
                continue;
            }
            if (CodeActionAdapter._isCommand(candidate)) {
                result.push({
                    title: candidate.title || '',
                    command: this.commands.converter.toSafeCommand(candidate, toDispose)
                });
            } else {
                if (codeActionContext.only) {
                    if (!candidate.kind) {
                        /* eslint-disable-next-line max-len */
                        console.warn(`${this.pluginId} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
                    } else if (!codeActionContext.only.contains(candidate.kind)) {
                        /* eslint-disable-next-line max-len */
                        console.warn(`${this.pluginId} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action is of kind '${candidate.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code action.`);
                    }
                }

                result.push({
                    title: candidate.title,
                    command: this.commands.converter.toSafeCommand(candidate.command, toDispose),
                    diagnostics: candidate.diagnostics && candidate.diagnostics.map(Converter.convertDiagnosticToMarkerData),
                    edit: candidate.edit && Converter.fromWorkspaceEdit(candidate.edit),
                    kind: candidate.kind && candidate.kind.value
                });
            }
        }

        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static _isCommand(smth: any): smth is theia.Command {
        return typeof (<theia.Command>smth).command === 'string' || typeof (<theia.Command>smth).id === 'string';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
