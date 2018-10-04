
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

import URI from 'vscode-uri/lib/umd';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from '../documents';
import { Hover } from '../../api/model';
import * as Converter from '../type-converters';
import { Range } from '../types-impl';
import { Position } from '../../api/plugin-api';
import { createToken } from '../token-provider';

export class HoverAdapter {

    constructor(
        private readonly provider: theia.HoverProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    public provideHover(resource: URI, position: Position): Promise<Hover | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;
        const pos = Converter.toPosition(position);

        return Promise.resolve(this.provider.provideHover(doc, pos, createToken())).then(value => {
            /* tslint:disable-next-line:no-any */
            if (!value || !Array.isArray(value.contents) || (value.contents as Array<any>).length === 0) {
                return undefined;
            }
            if (!value.range) {
                value.range = doc.getWordRangeAtPosition(pos);
            }
            if (!value.range) {
                value.range = new Range(pos, pos);
            }

            return Converter.fromHover(value);
        });
    }

}
