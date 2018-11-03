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
import * as types from '../types-impl';
import { ReferenceContext, Location } from '../../api/model';
import * as Converter from '../type-converters';
import { Position } from '../../api/plugin-api';
import { createToken } from '../token-provider';

export class ReferenceAdapter {

    constructor(
        private readonly provider: theia.ReferenceProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideReferences(resource: URI, position: Position, context: ReferenceContext): Promise<Location[] | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const document = documentData.document;
        const zeroBasedPosition = Converter.toPosition(position);

        return Promise.resolve(this.provider.provideReferences(document, zeroBasedPosition, context, createToken())).then(referencce => {
            if (!referencce) {
                return undefined;
            }

            if (this.isLocationArray(referencce)) {
                const locations: Location[] = [];

                for (const location of referencce) {
                    locations.push(Converter.fromLocation(location));
                }

                return locations;
            }
        });
    }

    /* tslint:disable-next-line:no-any */
    private isLocationArray(array: any): array is types.Location[] {
        return Array.isArray(array) && array.length > 0 && array[0] instanceof types.Location;
    }
}
