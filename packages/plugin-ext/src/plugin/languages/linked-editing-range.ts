// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import * as theia from '@theia/plugin';
import * as rpc from '../../common/plugin-api-rpc';
import { DocumentsExtImpl } from '../documents';
import { LinkedEditingRanges } from '../../common/plugin-api-rpc-model';
import { URI } from '@theia/core/shared/vscode-uri';
import { coalesce } from '../../common/arrays';
import { fromRange, toPosition } from '../type-converters';
import { serializeRegExp } from '../languages-utils';

export class LinkedEditingRangeAdapter {

    constructor(
        private readonly documents: DocumentsExtImpl,
        private readonly provider: theia.LinkedEditingRangeProvider
    ) { }

    async provideRanges(resource: URI, position: rpc.Position, token: theia.CancellationToken): Promise<LinkedEditingRanges | undefined> {

        const doc = this.documents.getDocument(resource);
        const pos = toPosition(position);

        const value = await this.provider.provideLinkedEditingRanges(doc, pos, token);
        if (value && Array.isArray(value.ranges)) {
            return {
                ranges: coalesce(value.ranges.map(r => fromRange(r))),
                wordPattern: serializeRegExp(value.wordPattern)
            };
        }
        return undefined;
    }

}
