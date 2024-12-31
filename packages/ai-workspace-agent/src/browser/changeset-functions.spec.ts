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
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ChangeOperation, ContentChangeApplier } from './content-change-applier';

disableJSDOM();

describe('ContentChangeApplier', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        // Disable JSDOM after all tests
        disableJSDOM();
    });

    describe('applyChangesToContent', () => {

        let contentChangeApplier: ContentChangeApplier;

        beforeEach(() => {
            contentChangeApplier = new ContentChangeApplier();
        });

        it('should replace text correctly', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'replace', find: 'world', replaceWith: 'there' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello there!');
        });

        it('should insert after text correctly', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'insert_after', find: 'Hello', insertAfter: ' amazing' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello amazing world!');
        });

        it('should insert before text correctly', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'insert_before', find: 'world', insertBefore: 'brave ' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello brave world!');
        });

        it('should delete text correctly', () => {
            const content = 'Hello brave new world!';
            const changes: ChangeOperation[] = [
                { operation: 'delete', find: 'brave ' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello new world!');
        });

        it('should replace entire content', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'replace_entire_file', newContent: 'Goodbye everyone.' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Goodbye everyone.');
        });

        it('should insert at the start of the file', () => {
            const content = 'quick brown fox';
            const changes: ChangeOperation[] = [
                { operation: 'insert_at', position: 'start_of_file', newContent: 'The ' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('The quick brown fox');
        });

        it('should insert at the end of the file', () => {
            const content = 'The quick brown fox';
            const changes: ChangeOperation[] = [
                { operation: 'insert_at', position: 'end_of_file', newContent: ' jumps over the lazy dog.' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('The quick brown fox jumps over the lazy dog.');
        });

        it('should create file content when original content is empty', () => {
            const content = '';
            const changes: ChangeOperation[] = [
                { operation: 'create_file', newContent: 'Hello from a new file.' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello from a new file.');
        });
    });
});
