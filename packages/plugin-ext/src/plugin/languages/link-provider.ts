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
import { DocumentLink } from '../../common/plugin-api-rpc-model';
import * as Converter from '../type-converters';
import { ObjectIdentifier } from '../../common/object-identifier';

export class LinkProviderAdapter {
    private cacheId = 0;
    private cache = new Map<number, theia.DocumentLink>();

    constructor(
        private readonly provider: theia.DocumentLinkProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideLinks(resource: URI, token: theia.CancellationToken): Promise<DocumentLink[] | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        const doc = document.document;

        return Promise.resolve(this.provider.provideDocumentLinks(doc, token)).then(links => {
            if (!Array.isArray(links)) {
                return undefined;
            }
            const result: DocumentLink[] = [];
            for (const link of links) {
                const data = Converter.DocumentLink.from(link);
                const id = this.cacheId++;
                ObjectIdentifier.mixin(data, id);
                this.cache.set(id, link);
                result.push(data);
            }
            return result;
        });
    }

    resolveLink(link: DocumentLink, token: theia.CancellationToken): Promise<DocumentLink | undefined> {
        if (typeof this.provider.resolveDocumentLink !== 'function') {
            return Promise.resolve(undefined);
        }
        const id = ObjectIdentifier.of(link);
        const item = this.cache.get(id);
        if (!item) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve(this.provider.resolveDocumentLink(item, token)).then(value => {
            if (value) {
                return Converter.DocumentLink.from(value);
            }
            return undefined;
        });
    }

    releaseDocumentLinks(ids: number[]): void {
        ids.forEach(id => {
            this.cache.delete(id);
        });
    }
}
