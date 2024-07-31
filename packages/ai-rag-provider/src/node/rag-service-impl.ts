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

import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { injectable } from '@theia/core/shared/inversify';
import { QueryResult, RagService } from '../common/rag-service';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

import * as fs from 'fs';
import * as path from 'path';

@injectable()
export class RagServiceImpl implements RagService {

    protected markInitialized: () => void;
    protected initialized: Promise<void> = new Promise(resolve => { this.markInitialized = resolve; });

    // TODO instead of using the OpenAIEmbeddings we could wrap our LanguageModelProvider
    protected vectorStore = new MemoryVectorStore(new OpenAIEmbeddings({ model: 'text-embedding-3-large', }));
    protected loaded = new Set<string>();
    protected init = false;

    async loadFile(filePath: string): Promise<void> {
        // TODO we could use a langchain cache here
        if (!this.loaded.has(filePath)) {
            this.loaded.add(filePath);
            const loader = new TextLoader(filePath);
            const docs = await loader.load();
            const splitter = new RecursiveCharacterTextSplitter({
                chunkSize: 50,
                chunkOverlap: 1
            });

            const docOutput = await splitter.splitDocuments(docs);

            docOutput.forEach((doc, index) => {
                doc.metadata.part = index;
                doc.metadata.filePath = filePath;
            });
            this.vectorStore.addDocuments(docOutput);
            console.log(`Loaded ${filePath} into vector database as ${docOutput.length} documents`);
        }
    }

    async queryPageContent(query: string, numberOfDocuments: number = 1): Promise<QueryResult[]> {
        console.log(`Querying for: ${query}`);
        const documents = await this.vectorStore.similaritySearch(query, numberOfDocuments);
        console.log('Similarity search finished');
        return documents.map(doc => ({ content: doc.pageContent, metadata: doc.metadata }));
    }

    async getAllFiles(dirPath: string, arrayOfFiles: string[] = []): Promise<string[]> {
        const files = fs.readdirSync(dirPath);

        arrayOfFiles = arrayOfFiles || [];

        for (const file of files) {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                arrayOfFiles = await this.getAllFiles(filePath, arrayOfFiles);
            } else {
                arrayOfFiles.push(filePath);
            }

        }

        return arrayOfFiles;
    }
}
