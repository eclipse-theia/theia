// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { matchFunctionsRegEx, parseFunctionReference } from './prompt-service-util';

describe('prompt-service-util', () => {

    describe('parseFunctionReference', () => {
        it('parses a plain function id as non-deferred', () => {
            const result = parseFunctionReference('myFunction');
            expect(result).to.deep.equal({ id: 'myFunction', deferred: false });
        });

        it('parses a function id with the deferred marker', () => {
            const result = parseFunctionReference('?myFunction');
            expect(result).to.deep.equal({ id: 'myFunction', deferred: true });
        });

        it('handles surrounding whitespace', () => {
            expect(parseFunctionReference('  myFunction  ')).to.deep.equal({ id: 'myFunction', deferred: false });
            expect(parseFunctionReference('  ?myFunction  ')).to.deep.equal({ id: 'myFunction', deferred: true });
            expect(parseFunctionReference('? myFunction')).to.deep.equal({ id: 'myFunction', deferred: true });
        });

        it('preserves dotted and underscore ids', () => {
            expect(parseFunctionReference('?mcp_my-server_some.tool')).to.deep.equal({
                id: 'mcp_my-server_some.tool',
                deferred: true
            });
        });
    });

    describe('matchFunctionsRegEx with parseFunctionReference', () => {
        it('extracts id and deferred state from a template using ~{?id} syntax', () => {
            const template = 'Use ~{toolA} and also ~{?toolB} for the task.';
            const matches = matchFunctionsRegEx(template);
            expect(matches.length).to.equal(2);

            const first = parseFunctionReference(matches[0][1]);
            expect(first).to.deep.equal({ id: 'toolA', deferred: false });

            const second = parseFunctionReference(matches[1][1]);
            expect(second).to.deep.equal({ id: 'toolB', deferred: true });
        });
    });
});
