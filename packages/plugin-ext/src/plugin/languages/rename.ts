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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import * as Converter from '../type-converters';
import * as model from '../../common/plugin-api-rpc-model';
import { DocumentsExtImpl } from '../documents';
import { WorkspaceEditDto } from '../../common/plugin-api-rpc';
import { Position } from '../../common/plugin-api-rpc';
import { Range } from '../types-impl';
import { isObject } from '../../common/types';

export class RenameAdapter {

    static supportsResolving(provider: theia.RenameProvider): boolean {
        return typeof provider.prepareRename === 'function';
    }

    constructor(
        private readonly provider: theia.RenameProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideRenameEdits(resource: URI, position: Position, newName: string, token: theia.CancellationToken): Promise<WorkspaceEditDto | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const doc = document.document;
        const pos = Converter.toPosition(position);

        return Promise.resolve(
            this.provider.provideRenameEdits(doc, pos, newName, token)
        ).then(value => {
            if (!value) {
                return undefined;
            }

            return Converter.fromWorkspaceEdit(value);
        }, error => {
            const rejectReason = RenameAdapter.asMessage(error);
            if (rejectReason) {
                return <WorkspaceEditDto>{
                    rejectReason,
                    edits: []
                };
            } else {
                return Promise.reject<WorkspaceEditDto>(error);
            }
        });
    }

    resolveRenameLocation(resource: URI, position: Position, token: theia.CancellationToken): Promise<model.RenameLocation & model.Rejection | undefined> {
        if (typeof this.provider.prepareRename !== 'function') {
            return Promise.resolve(undefined);
        }

        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const doc = document.document;
        const pos = Converter.toPosition(position);

        return Promise.resolve(
            this.provider.prepareRename(doc, pos, token)
        ).then(rangeOrLocation => {

            let range: theia.Range | undefined;
            let text: string;
            if (rangeOrLocation && Range.isRange(rangeOrLocation)) {
                range = rangeOrLocation;
                text = doc.getText(rangeOrLocation);
            } else if (rangeOrLocation && isObject(rangeOrLocation)) {
                range = rangeOrLocation.range;
                text = rangeOrLocation.placeholder;
            }

            if (!range) {
                return undefined;
            }
            if (range.start.line > pos.line || range.end.line < pos.line) {
                console.warn('INVALID rename location: position line must be within range start/end lines');
                return undefined;
            }
            return {
                range: Converter.fromRange(range)!,
                text: text!
            };
        }, error => {
            const rejectReason = RenameAdapter.asMessage(error);
            if (rejectReason) {
                return Promise.resolve(<model.RenameLocation & model.Rejection>{
                    rejectReason,
                    range: undefined!,
                    text: undefined!
                });
            } else {
                return Promise.reject(error);
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static asMessage(err: any): string | undefined {
        if (typeof err === 'string') {
            return err;
        } else if (err instanceof Error && typeof err.message === 'string') {
            return err.message;
        } else {
            return undefined;
        }
    }

}
