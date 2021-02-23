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
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { RawColorInfo } from '../../common/plugin-api-rpc';
import { ColorPresentation } from '../../common/plugin-api-rpc-model';

export class ColorProviderAdapter {

    constructor(
        private documents: DocumentsExtImpl,
        private provider: theia.DocumentColorProvider
    ) { }

    provideColors(resource: URI, token: theia.CancellationToken): Promise<RawColorInfo[]> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;

        return Promise.resolve(
            this.provider.provideDocumentColors(doc, token)
        ).then(colors => {
            if (!Array.isArray(colors)) {
                return [];
            }

            const colorInfos: RawColorInfo[] = colors.map(colorInfo => ({
                color: Converter.fromColor(colorInfo.color),
                range: Converter.fromRange(colorInfo.range)!
            }));

            return colorInfos;
        });
    }

    provideColorPresentations(resource: URI, raw: RawColorInfo, token: theia.CancellationToken): Promise<ColorPresentation[]> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for ${resource}`));
        }

        const doc = document.document;
        const range = Converter.toRange(raw.range);
        const color = Converter.toColor(raw.color);
        return Promise.resolve(
            this.provider.provideColorPresentations(color, { document: doc, range: range }, token)
        ).then(value => {
            if (!Array.isArray(value)) {
                return [];
            }

            return value.map(Converter.fromColorPresentation);
        });
    }

}
