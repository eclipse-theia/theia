/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { DisposableCollection } from '@theia/core/lib/common/';
import {
    ILanguageClient,
    TextDocumentFeature,
    TextDocumentRegistrationOptions,
    ClientCapabilities,
    ServerCapabilities,
    Disposable,
    DocumentSelector
} from '../';
import { SemanticHighlight, SemanticHighlightingParams } from './semantic-highlighting-protocol';

// NOTE: This module can be removed, or at least can be simplified once the semantic highlighting will become the part of the LSP.
// https://github.com/Microsoft/vscode-languageserver-node/issues/368

export class SemanticHighlightFeature extends TextDocumentFeature<TextDocumentRegistrationOptions> {

    protected readonly languageId: string;
    protected readonly toDispose: DisposableCollection;

    constructor(
        client: ILanguageClient & Readonly<{ languageId: string }>,
        protected readonly initializeCallback: SemanticHighlightFeature.SemanticHighlightFeatureInitializeCallback,
        protected readonly consumer: SemanticHighlightFeature.SemanticHighlightingParamsConsumer) {

        super(client, SemanticHighlight.type);
        this.languageId = client.languageId;
        this.toDispose = new DisposableCollection();
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if (!capabilities.textDocument) {
            capabilities.textDocument = {};
        }
        // tslint:disable-next-line:no-any
        (capabilities.textDocument as any).semanticHighlightingCapabilities = {
            semanticHighlighting: true
        };
    }

    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
        if (!documentSelector) {
            return;
        }
        const capabilitiesExt: ServerCapabilities & { semanticHighlighting?: { scopes: string[][] | undefined } } = capabilities;
        if (capabilitiesExt.semanticHighlighting) {
            const { scopes } = capabilitiesExt.semanticHighlighting;
            if (scopes && scopes.length > 0) {
                this.toDispose.push(this.initializeCallback(this.languageId, scopes));
                const id = v4();
                this.register(this.messages, {
                    id,
                    registerOptions: Object.assign({}, { documentSelector: documentSelector }, capabilitiesExt.semanticHighlighting)
                });
            }
        }
    }

    protected registerLanguageProvider(): Disposable {
        this._client.onNotification(SemanticHighlight.type.method, this.consumeSemanticHighlighting.bind(this));
        return Disposable.create(() => this.toDispose.dispose());
    }

    protected consumeSemanticHighlighting(params: SemanticHighlightingParams): void {
        this.consumer(params);
    }

}

export namespace SemanticHighlightFeature {

    export interface SemanticHighlightingParamsConsumer {

        /**
         * Consumes a semantic highlighting notification, received from the language server.
         */
        (params: SemanticHighlightingParams): void
    }

    export interface SemanticHighlightFeatureInitializeCallback {

        /**
         * Invoked when the connection between the client and the server has been established and the server sends back
         * a "lookup table" of TextMate scopes.
         */
        (languageId: string, scopes: string[][]): Disposable
    }

}
