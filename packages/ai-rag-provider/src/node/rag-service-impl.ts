// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { OpenAIEmbeddings } from '@langchain/openai'
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { injectable } from '@theia/core/shared/inversify';
import { RagService } from '../common/rag-service';

@injectable()
export class RagServiceImpl implements RagService {

    protected markInitialized: () => void;
    protected initialized: Promise<void> = new Promise(resolve => { this.markInitialized = resolve; });

    protected vectorStore = new MemoryVectorStore(new OpenAIEmbeddings({ model: 'text-embedding-3-large', }));
    protected loaded = new Set<string>();

    async loadFile(filePath: string): Promise<void> {
        // TODO we could use a langchain cache here
        if (!this.loaded.has(filePath)) {
            const loader = new TextLoader(filePath);
            const docs = await loader.load();
            // TODO we could split the documents into smaller chunks using something like RecursiveTextSplitter
            this.vectorStore.addDocuments(docs);
        }
    }

    async queryPageContent(query: string, numberOfDocuments: number = 1): Promise<string[]> {
        const documents = await this.vectorStore.similaritySearch(query, numberOfDocuments);
        return documents.map(doc => doc.pageContent);
    }
}
