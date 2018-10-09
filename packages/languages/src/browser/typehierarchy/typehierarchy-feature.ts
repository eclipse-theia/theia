/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { v4 } from 'uuid';
import {
    Disposable,
    ILanguageClient,
    DocumentSelector,
    ClientCapabilities,
    ServerCapabilities,
    TextDocumentFeature,
    TextDocumentRegistrationOptions
} from '../language-client-services';
import { TypeHierarchyRequest } from './typehierarchy-protocol';

// NOTE: This module can be removed, or at least can be simplified once the type hierarchy will become the part of the LSP.
// https://github.com/Microsoft/language-server-protocol/issues/582
// https://github.com/Microsoft/vscode-languageserver-node/pull/346#discussion_r221659062

/**
 * Text document feature for handling super- and subtype hierarchies through the LSP.
 */
export class TypeHierarchyFeature extends TextDocumentFeature<TextDocumentRegistrationOptions> {

    constructor(readonly client: ILanguageClient) {
        super(client, TypeHierarchyRequest.type);
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if (!capabilities.textDocument) {
            capabilities.textDocument = {};
        }
        // tslint:disable-next-line:no-any
        (capabilities.textDocument as any).typeHierarchy = {
            dynamicRegistration: true
        };
    }

    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
        if (!documentSelector) {
            return;
        }
        const capabilitiesExt: ServerCapabilities & { typeHierarchyProvider?: boolean } = capabilities;
        if (capabilitiesExt.typeHierarchyProvider) {
            const id = v4();
            this.register(this.messages, {
                id,
                registerOptions: Object.assign({}, { documentSelector: documentSelector }, capabilitiesExt.typeHierarchyProvider)
            });
        }
    }

    protected registerLanguageProvider(): Disposable {
        return Disposable.create(() => { /* NOOP */ });
    }

}
