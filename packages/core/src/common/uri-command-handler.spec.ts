// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import * as chai from 'chai';
import { SelectionService } from './selection-service';
import { MaybeArray } from './types';
import URI from './uri';
import { UriAwareCommandHandler, UriCommandHandler } from './uri-command-handler';

const expect = chai.expect;

interface CommandHandlerMock extends UriCommandHandler<MaybeArray<URI>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastCall: any[];
}

const mockHandler: CommandHandlerMock = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute(...args: any[]): void { this.lastCall = args; },
    lastCall: []
};
const selectedURIs = [
    new URI('/foo'),
    new URI('/bar'),
];
const mockSelectionService = {
    selection: selectedURIs.map(uri => ({ uri }))
} as unknown as SelectionService;

describe('URI-Aware Command Handlers', () => {
    afterEach(() => {
        mockHandler.lastCall = [];
    });

    describe('UriAwareCommandHandler', () => {
        it('getUri returns the first argument if it is a URI (single)', () => {
            const args = [new URI('/passed/in'), 'some', 'other', 'args'];
            const output = UriAwareCommandHandler.MonoSelect(mockSelectionService, mockHandler)['getUri'](...args);
            expect(output).equals(args[0]);
        });
        it('getUri returns the first argument if it is a URI (multi)', () => {
            const args = [[new URI('/passed/in')], 'some', 'other', 'args'];
            const output = UriAwareCommandHandler.MultiSelect(mockSelectionService, mockHandler)['getUri'](...args);
            expect(output).equals(args[0]);
        });
        it('getUri returns an argument from the service if no URI is provided (single)', () => {
            const args = ['some', 'other', 'args'];
            const output = UriAwareCommandHandler.MonoSelect(mockSelectionService, mockHandler)['getUri'](...args);
            expect(output).equals(selectedURIs[0]);
        });
        it('getUri returns an argument from the service if no URI is provided (multi)', () => {
            const args = ['some', 'other', 'args'];
            const output = UriAwareCommandHandler.MultiSelect(mockSelectionService, mockHandler)['getUri'](...args);
            expect(output).deep.equals(selectedURIs);
        });
        it('calls the handler with the same args if the first argument if it is a URI (single)', () => {
            const args = [new URI('/passed/in'), 'some', 'other', 'args'];
            UriAwareCommandHandler.MonoSelect(mockSelectionService, mockHandler)['execute'](...args);
            expect(mockHandler.lastCall).deep.equals(args);
        });
        it('calls the handler with the same args if the first argument if it is a URI (multi)', () => {
            const args = [[new URI('/passed/in')], 'some', 'other', 'args'];
            UriAwareCommandHandler.MultiSelect(mockSelectionService, mockHandler)['execute'](...args);
            expect(mockHandler.lastCall).deep.equals(args);
        });
        it('calls the handler with an argument from the service if no URI is provided (single)', () => {
            const args = ['some', 'other', 'args'];
            UriAwareCommandHandler.MonoSelect(mockSelectionService, mockHandler)['execute'](...args);
            expect(mockHandler.lastCall).deep.equals([selectedURIs[0], ...args]);
        });
        it('calls the handler with an argument from the service if no URI is provided (multi)', () => {
            const args = ['some', 'other', 'args'];
            UriAwareCommandHandler.MultiSelect(mockSelectionService, mockHandler)['execute'](...args);
            expect(mockHandler.lastCall).deep.equals([selectedURIs, ...args]);
        });
    });
});
