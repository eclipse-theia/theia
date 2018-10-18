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

import { RequestType, RequestHandler } from 'vscode-jsonrpc';
import { SymbolKind, Location, Range } from 'vscode-languageserver-types';
import * as lsp from 'vscode-languageserver';

export interface CallsClientCapabilities {
    /**
     * The text document client capabilities
     */
    textDocument?: {
        /**
         * Capabilities specific to the `textDocument/calls`
         */
        calls?: {
            /**
             * Whether implementation supports dynamic registration. If this is set to `true`
             * the client supports the new `(TextDocumentRegistrationOptions & StaticRegistrationOptions)`
             * return value for the corresponding server capability as well.
             */
            dynamicRegistration?: boolean;
        };
    }
}

export interface CallsServerCapabilities {
    /**
     * The server provides Call Hierarchy support.
     */
    callsProvider?: boolean | (lsp.TextDocumentRegistrationOptions & lsp.StaticRegistrationOptions);
}

/**
 * A request to resolve all calls at a given text document position of a symbol definition or a call the same.
 * The request's parameter is of type [CallsParams](#CallsParams), the response is of type [CallsResult](#CallsResult) or a
 * Thenable that resolves to such.
 */
export namespace CallsRequest {
    export const type = new RequestType<CallsParams, CallsResult, void, lsp.TextDocumentRegistrationOptions>('textDocument/calls');
    export type HandlerSignature = RequestHandler<CallsParams, CallsResult | null, void>;
}

/**
 * The parameters of a `textDocument/calls` request.
 */
export interface CallsParams extends lsp.TextDocumentPositionParams {
    /**
     * Outgoing direction for callees.
     * The default is incoming for callers.
     */
    direction?: CallDirection;
}

/**
 * Enum of call direction kinds
 */
export enum CallDirection {
    /**
     * Incoming calls aka. callers
     */
    Incoming = 'incoming',
    /**
     * Outgoing calls aka. callees
     */
    Outgoing = 'outgoing',
}

/**
 * The result of a `textDocument/calls` request.
 */
export interface CallsResult {
    /**
     * The symbol of a definition for which the request was made.
     *
     * If no definition is found at a given text document position, the symbol is undefined.
     */
    symbol?: DefinitionSymbol;
    /**
     * List of calls.
     */
    calls: Call[];
}

/**
 * Represents a directed call.
 */
export interface Call {
    /**
     * Actual location of a call to a definition.
     */
    location: Location;
    /**
     * Symbol refered to by this call. For outgoing calls this is a callee,
     * otherwise a caller.
     */
    symbol: DefinitionSymbol;
}

export interface DefinitionSymbol {
    /**
     * The name of this symbol.
     */
    name: string;
    /**
     * More detail for this symbol, e.g the signature of a function.
     */
    detail?: string;
    /**
     * The kind of this symbol.
     */
    kind: SymbolKind;
    /**
     * The range enclosing this symbol not including leading/trailing whitespace but everything else
     * like comments. This information is typically used to determine if the the clients cursor is
     * inside the symbol to reveal in the symbol in the UI.
     */
    location: Location;
    /**
     * The range that should be selected and revealed when this symbol is being picked, e.g the name of a function.
     * Must be contained by the the `range`.
     */
    selectionRange: Range;

}
