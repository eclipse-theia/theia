// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { ToolRequest } from './language-model';

describe('ToolRequest.isToolRequestParameters', () => {
    it('accepts a property with a plain string type', () => {
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { name: { type: 'string' } }
            })
        ).to.equal(true);
    });

    it('accepts a property whose type is a union array (JSON Schema 2020-12)', () => {
        // Mirrors the shape produced by MCP tools with `type: ["string", "null"]`.
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { opt: { type: ['string', 'null'] } }
            })
        ).to.equal(true);
    });

    it('accepts a property whose type array has more than two elements', () => {
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { mixed: { type: ['string', 'number', 'null'] } }
            })
        ).to.equal(true);
    });

    it('rejects a property whose type array contains a non-string element', () => {
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { bad: { type: ['string', 42] } }
            })
        ).to.equal(false);
    });

    it('rejects a property whose type is not a string or an array of strings', () => {
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { bad: { type: 42 } }
            })
        ).to.equal(false);
    });

    it('rejects a property without a type or anyOf', () => {
        expect(
            ToolRequest.isToolRequestParameters({
                type: 'object',
                properties: { bad: {} }
            })
        ).to.equal(false);
    });

    it('rejects a top-level object without a properties object', () => {
        expect(
            ToolRequest.isToolRequestParameters({ type: 'object' })
        ).to.equal(false);
    });
});
