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
import * as theia from '@theia/plugin';
import { DataTransferDTO, DocumentDropEdit } from '../../common/plugin-api-rpc-model';
import { CancellationToken } from '@theia/core/shared/vscode-languageserver-protocol';
import { Position } from '../../common/plugin-api-rpc';
import * as Converter from '../type-converters';
import { DocumentsExtImpl } from '../documents';
import { URI } from '@theia/core/shared/vscode-uri';
import { FileSystemExtImpl } from '../file-system-ext-impl';
import * as os from 'os';
import * as path from 'path';

export class DocumentDropEditAdapter {
    constructor(private readonly provider: theia.DocumentDropEditProvider,
        private readonly documents: DocumentsExtImpl,
        private readonly fileSystem: FileSystemExtImpl) { }

    async provideDocumentDropEdits(resource: URI, position: Position, dataTransfer: DataTransferDTO, token: CancellationToken): Promise<DocumentDropEdit | undefined> {
        return this.provider.provideDocumentDropEdits(
            this.documents.getDocument(resource),
            Converter.toPosition(position),
            Converter.DataTransfer.toDataTransfer(dataTransfer, itemId => this.resolveFileData(itemId)),
            token) as DocumentDropEdit | undefined;
    }

    private async resolveFileData(itemId: string): Promise<Uint8Array> {
        const filePath = URI.file(path.resolve(os.tmpdir(), 'theia_upload', itemId));
        return this.fileSystem.fileSystem.readFile(filePath);
    }
}
