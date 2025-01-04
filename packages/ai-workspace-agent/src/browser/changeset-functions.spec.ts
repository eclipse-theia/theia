// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the
// Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
// version 2
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

    describe('applyChangesToContent (Full-Line Anchors)', () => {

        let contentChangeApplier: ContentChangeApplier;

        beforeEach(() => {
            contentChangeApplier = new ContentChangeApplier();
        });

        it('should replace an entire line correctly', () => {
            // Original single-line content
            const content = 'Hello world!';
            // We are replacing the entire line "Hello world!" with "Hello there!"
            const changes: ChangeOperation[] = [
                { operation: 'replace', anchor: 'Hello world!', newContent: 'Hello there!' }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('Hello there!');
        });

        it('should insert a line before an anchor line correctly', () => {
            // Two-line file
            const content = [
                'Hello world!',
                'Another line'
            ].join('\n');

            // Insert a new line before "Another line"
            const changes: ChangeOperation[] = [
                {
                    operation: 'insertBefore',
                    anchor: 'Another line',
                    newContent: 'Inserted line'
                }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal([
                'Hello world!',
                'Inserted line',
                'Another line'
            ].join('\n'));
        });

        it('should insert at the end of the file without extra newlines', () => {
            const content = 'The quick brown fox';
            const changes: ChangeOperation[] = [
                {
                    operation: 'insertAtEndOfFile',
                    newContent: ' jumps over the lazy dog.'
                }
            ];
            // Expect the two strings concatenated
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal('The quick brown fox jumps over the lazy dog.');
        });

        it('should create file content when the original content is empty', () => {
            const content = '';
            const changes: ChangeOperation[] = [
                {
                    operation: 'create_file',
                    newContent: 'Hello from a new file.'
                }
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
            // Anchor is empty
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'replace', anchor: '', newContent: 'there' }
            ];
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Anchor is required for replace operation.'
            );
        });

        it('should throw an error if anchor is missing for insertBefore', () => {
            // Anchor is empty
            const content = 'Hello world!';
            const changes: ChangeOperation[] = [
                { operation: 'insertBefore', anchor: '', newContent: 'amazing ' }
            ];
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Anchor is required for insertBefore operation.'
            );
        });

        it('should throw an error if the anchor line does not match exactly', () => {
            const content = 'Hello world!';
            // The anchor is spelled differently or has extra punctuation
            const changes: ChangeOperation[] = [
                { operation: 'replace', anchor: 'Hello world', newContent: 'Hello there!' }
            ];
            // Expecting an error because "Hello world" is not an exact line match to "Hello world!"
            expect(() => contentChangeApplier.applyChangesToContent(content, changes)).to.throw(
                'Anchor not found: "Hello world"'
            );
        });

        it('should replace multiple consecutive lines using a multi-line anchor', () => {
            // Multi-line content
            const content = [
                'LineA',
                'LineB',
                'LineC',
                'LineD'
            ].join('\n');

            // Anchor: lines B + C
            const multiLineAnchor = [
                'LineB',
                'LineC'
            ].join('\n');

            // We replace those two lines with a single line
            const newMultiLineContent = 'NewLineBC';

            const changes: ChangeOperation[] = [
                {
                    operation: 'replace',
                    anchor: multiLineAnchor,
                    newContent: newMultiLineContent
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            // Expected lines: A, then the new line, then D
            expect(updatedContent).to.equal([
                'LineA',
                'NewLineBC',
                'LineD'
            ].join('\n'));
        });

        it('should insert multiple lines before a multi-line anchor', () => {
            const content = [
                'First line',
                'Second line',
                'Third line'
            ].join('\n');

            // We'll insert new text before "Second line"
            const changes: ChangeOperation[] = [
                {
                    operation: 'insertBefore',
                    anchor: 'Second line',
                    newContent: [
                        'INSERTED line 1',
                        'INSERTED line 2'
                    ].join('\n')
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal([
                'First line',
                'INSERTED line 1',
                'INSERTED line 2',
                'Second line',
                'Third line'
            ].join('\n'));
        });

        it('should handle CRLF vs. LF by not duplicating newlines (manual check)', () => {
            // If you want to specifically test CRLF logic, you can create a content string with \r\n:
            const content = 'First line\r\nSecond line';
            const changes: ChangeOperation[] = [
                {
                    operation: 'insertBefore',
                    anchor: 'Second line',
                    newContent: 'Inserted CRLF line'
                }
            ];
            // We expect the final content to preserve \r\n
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);

            // Join them as \r\n in the final result
            const expected = [
                'First line',
                'Inserted CRLF line',
                'Second line'
            ].join('\r\n');

            expect(updatedContent).to.equal(expected);
        });

        //
        // Additional / Enhanced Tests for Ignoring Leading and Trailing Spaces
        //

        it('should replace ignoring leading/trailing spaces in the anchor (single-line)', () => {
            const content = '    Indented line A';
            // The anchor has fewer leading spaces, extra trailing spaces
            const anchor = 'Indented line A    ';
            const changes: ChangeOperation[] = [
                {
                    operation: 'replace',
                    anchor,
                    newContent: 'Replaced line A'
                }
            ];
            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            // The replaced line does not have to preserve indentation—it's inserted verbatim
            expect(updatedContent).to.equal('Replaced line A');
        });

        it('should replace ignoring leading/trailing spaces in a multi-line anchor', () => {
            const content = [
                '   Some line 1',
                '   Some line 2    ',
                '   Some line 3'
            ].join('\n');

            const anchor = [
                'Some line 2    ',  // fewer leading spaces, extra trailing
                'Some line 3'      // fewer leading spaces
            ].join('\n');

            const changes: ChangeOperation[] = [
                {
                    operation: 'replace',
                    anchor,
                    newContent: 'New replaced lines'
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            // Expect line 1 unchanged, lines 2+3 replaced by a single line
            expect(updatedContent).to.equal([
                '   Some line 1',
                'New replaced lines'
            ].join('\n'));
        });

        it('should insert before an anchor that has different indentation and trailing spaces', () => {
            const content = [
                'Line A',
                '    Special anchor   ',
                'Line B'
            ].join('\n');

            const changes: ChangeOperation[] = [
                {
                    operation: 'insertBefore',
                    anchor: ' Special anchor ',
                    newContent: 'Inserted ignoring indentation'
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            expect(updatedContent).to.equal([
                'Line A',
                'Inserted ignoring indentation',
                '    Special anchor   ',
                'Line B'
            ].join('\n'));
        });

        it('should only replace the first matching block if the anchor is repeated, ignoring whitespace', () => {
            const content = [
                '  Repeated anchor text  ',
                'Some middle line',
                '  Repeated anchor text  '
            ].join('\n');

            // The anchor is "Repeated anchor text" ignoring whitespace
            const anchor = 'Repeated anchor text';
            const changes: ChangeOperation[] = [
                {
                    operation: 'replace',
                    anchor,
                    newContent: 'Replaced anchor text'
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(content, changes);
            // Expect only the first occurrence to be replaced
            expect(updatedContent).to.equal([
                'Replaced anchor text',  // replaced
                'Some middle line',
                '  Repeated anchor text  ' // unchanged
            ].join('\n'));
        });

        //
        // New Tests for 'fullFile' Operation
        //

        it('should overwrite the entire file using fullFile operation', () => {
            const originalContent = [
                'Line 1',
                'Line 2',
                'Line 3'
            ].join('\n');

            // We'll overwrite the entire file with new content
            const changes: ChangeOperation[] = [
                {
                    // Your new operation
                    operation: 'fullFile',
                    newContent: [
                        'Overwritten line A',
                        'Overwritten line B'
                    ].join('\n')
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(originalContent, changes);
            expect(updatedContent).to.equal([
                'Overwritten line A',
                'Overwritten line B'
            ].join('\n'));
        });

        it('should apply multiple operations, then overwrite everything with fullFile', () => {
            const originalContent = [
                'Initial line',
                'Line to be replaced',
                'Final line'
            ].join('\n');

            // We'll do two changes: replace one line, then do a fullFile overwrite
            const changes: ChangeOperation[] = [
                {
                    operation: 'replace',
                    anchor: 'Line to be replaced',
                    newContent: 'Replacement line'
                },
                {
                    // Finally, overwrite all content
                    operation: 'fullFile',
                    newContent: 'All new content, ignoring prior lines.'
                }
            ];

            const updatedContent = contentChangeApplier.applyChangesToContent(originalContent, changes);
            // The final result should only be the last newContent
            expect(updatedContent).to.equal('All new content, ignoring prior lines.');
        });

    });
});
