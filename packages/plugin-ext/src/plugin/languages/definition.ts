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
import { DocumentsExtImpl } from '../documents';
import * as types from '../types-impl';
import * as Converter from '../type-converters';
import { Position } from '../../common/plugin-api-rpc';
import { Definition, LocationLink, Location } from '../../common/plugin-api-rpc-model';
import { isDefinitionLinkArray, isLocationArray } from './util';

export class DefinitionAdapter {

    constructor(
        private readonly delegate: theia.DefinitionProvider,
        private readonly documents: DocumentsExtImpl) {

    }

    provideDefinition(resource: URI, position: Position, token: theia.CancellationToken): Promise<Definition | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const document = documentData.document;
        const zeroBasedPosition = Converter.toPosition(position);

        return Promise.resolve(this.delegate.provideDefinition(document, zeroBasedPosition, token)).then(definition => {
            if (!definition) {
                return undefined;
            }

            if (definition instanceof types.Location) {
                return Converter.fromLocation(definition);
            }

            if (isLocationArray(definition)) {
                const locations: Location[] = [];

                for (const location of definition) {
                    locations.push(Converter.fromLocation(location));
                }

                return locations;
            }

            if (isDefinitionLinkArray(definition)) {
                const definitionLinks: LocationLink[] = [];

                for (const definitionLink of definition) {
                    definitionLinks.push(Converter.fromDefinitionLink(definitionLink));
                }

                return definitionLinks;
            }
        });
    }
}
