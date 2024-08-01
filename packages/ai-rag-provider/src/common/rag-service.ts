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

export const RAG_SERVICE_PATH = '/services/ai/rag';
export const RagService = Symbol('RagService');
// TODO metadata could be generalized to a Record<string, unknown>
export interface QueryResult { content: string, metadata: Record<string, string> };
export interface RagService {
    // FIXME only here for convenience, should be removed
    getAllFiles(dirPath: string, arrayOfFiles: string[]): Promise<string[]>;
    loadFile(filePath: string): Promise<void>;
    queryPageContent(query: string, numberOfDocuments?: number): Promise<QueryResult[]>;
}
