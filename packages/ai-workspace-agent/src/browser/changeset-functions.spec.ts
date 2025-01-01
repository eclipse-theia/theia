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
                { operation: 'replace', anchor: 'world', newContent: 'there' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello there!');
        });

        it('should insert before text correctly', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'insertBefore', anchor: 'world!', newContent: 'amazing ' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello amazing world!');
        });

        it('should insert at the end of the file', () => {
            const content = 'The quick brown fox';
            const changes: ChangeOperation[] = [
                { operation: 'insertAtEndOfFile', newContent: ' jumps over the lazy dog.' }
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

        it('should throw an error when create_file is applied to a non-empty file', () => {
            const content = 'Existing content';
            const changes: ChangeOperation[] = [
                { operation: 'create_file', newContent: 'Hello from a new file.' }
            ];
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Cannot perform create_file operation on an existing file. Ensure the file is empty or does not exist.'
            );
        });

        it('should throw an error if anchor is missing for replace', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'replace', anchor: '', newContent: 'there' }
            ];
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Anchor is required for replace operation.'
            );
        });

        it('should throw an error if anchor is missing for insertBefore', () => {
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'insertBefore', anchor: '', newContent: 'amazing ' }
            ];
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Anchor is required for insertBefore operation.'
            );
        });

    });
});
