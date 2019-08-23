/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import URI from '@theia/core/lib/common/uri';
import { LanguageClientProvider } from '@theia/languages/lib/browser/language-client-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import * as assert from 'assert';
import { inject, injectable } from 'inversify';
import { TextDocumentIdentifier } from 'monaco-languageclient/lib/services';
import { DocumentSymbolRequest } from 'vscode-languageserver-protocol/lib/protocol';
import { TestCase } from '../framework/test-case';

@injectable()
export class LanguagesTest implements TestCase {

    @inject(LanguageClientProvider)
    protected readonly languageProvider: LanguageClientProvider;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected async testLanguagesWorkflow(): Promise<void> {
        const languageClient = await this.languageProvider.getLanguageClient('typescript');
        assert.ok(languageClient);

        const roots = await this.workspaceService.roots;
        const resourceUri = new URI(roots[0].uri).withScheme('file').parent.resolve('testWorkspace/js/test.js').toString();

        const response = await languageClient!.sendRequest(DocumentSymbolRequest.type,
            { textDocument: TextDocumentIdentifier.create(resourceUri.toString()) });

        assert.ok(response);
    }
}
