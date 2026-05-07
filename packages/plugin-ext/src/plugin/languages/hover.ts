
// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import { Hover, HoverContext } from '../../common/plugin-api-rpc-model';
import * as Converter from '../type-converters';
import { Range } from '../types-impl';
import { HoverWithId, Position } from '../../common/plugin-api-rpc';

export class HoverAdapter {

    private _hoverCounter: number = 0;
    private _hoverMap: Map<number, theia.Hover> = new Map<number, theia.Hover>();

    private static HOVER_MAP_MAX_SIZE = 10;

    constructor(
        private readonly provider: theia.HoverProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    async provideHover(
        resource: URI,
        position: Position,
        context: HoverContext<{ id: number }> | undefined,
        token: theia.CancellationToken
    ): Promise<HoverWithId | undefined> {

        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;
        const pos = Converter.toPosition(position);

        let value: theia.Hover | null | undefined;
        if (context && context.verbosityRequest) {
            const previousHoverId = context.verbosityRequest.previousHover.id;
            const previousHover = this._hoverMap.get(previousHoverId);
            if (!previousHover) {
                throw new Error(`Hover with id ${previousHoverId} not found`);
            }
            const hoverContext: theia.HoverContext = { verbosityDelta: context.verbosityRequest.verbosityDelta, previousHover };
            value = await this.provider.provideHover(doc, pos, token, hoverContext);
        } else {
            value = await this.provider.provideHover(doc, pos, token);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!value || !Array.isArray(value.contents) || (value.contents as Array<any>).length === 0) {
            return undefined;
        }
        if (!value.range) {
            value.range = doc.getWordRangeAtPosition(pos);
        }
        if (!value.range) {
            value.range = new Range(pos, pos);
        }

        const convertedHover: Hover = Converter.fromHover(value);
        // Check if hover map has more than 10 elements and if yes, remove oldest from the map
        if (this._hoverMap.size === HoverAdapter.HOVER_MAP_MAX_SIZE) {
            const minimumId = Math.min(...this._hoverMap.keys());
            this._hoverMap.delete(minimumId);
        }
        const id = this._hoverCounter++;
        this._hoverMap.set(id, value);
        const hover: HoverWithId = {
            ...convertedHover,
            id
        };
        return hover;
    }

    releaseHover(id: number): void {
        this._hoverMap.delete(id);
    }

}
