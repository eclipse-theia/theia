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

import { expect } from 'chai';
import { isModelMatching, isToolCallContent, LanguageModel, LanguageModelSelector } from './language-model';

describe('isModelMatching', () => {
    it('returns false with one of two parameter mismatches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'XXX',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(false);
    });
    it('returns false with two parameter mismatches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'XXX',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'ZZZ',
                }
            )
        ).eql(false);
    });
    it('returns true with one parameter match', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'gpt-4o',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                }
            )
        ).eql(true);
    });
    it('returns true with two parameter matches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'gpt-4o',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(true);
    });
    it('returns true if there are no parameters in selector', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{},
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(true);
    });
});

describe('isToolCallContent', () => {

    it('accepts a well-formed ToolCallContent with a text item', () => {
        expect(isToolCallContent({ content: [{ type: 'text', text: 'hello' }] })).to.be.true;
    });

    it('accepts an empty content array', () => {
        expect(isToolCallContent({ content: [] })).to.be.true;
    });

    it('accepts content with mixed item types', () => {
        const value = {
            content: [
                { type: 'text', text: 'hello' },
                { type: 'image', mimeType: 'image/png', base64data: 'abc' },
                { type: 'error', data: 'boom' }
            ]
        };
        expect(isToolCallContent(value)).to.be.true;
    });

    it('rejects undefined', () => {
        expect(isToolCallContent(undefined)).to.be.false;
    });

    it('rejects null', () => {
        // eslint-disable-next-line no-null/no-null
        expect(isToolCallContent(null)).to.be.false;
    });

    it('rejects primitive values', () => {
        expect(isToolCallContent('not an object')).to.be.false;
        expect(isToolCallContent(42)).to.be.false;
        expect(isToolCallContent(true)).to.be.false;
    });

    it('rejects objects without a content key', () => {
        expect(isToolCallContent({ files: [] })).to.be.false;
        expect(isToolCallContent({})).to.be.false;
    });

    // Regression: this is the exact shape that triggered the chat-flicker bug.
    // `getWorkspaceFileList` echoes workspace entry names into the result keys,
    // and a workspace containing a directory literally named `content` produces
    // an object where `content` is a plain string, not a ToolCallContentResult
    // array.
    it('rejects an object whose content is a string (regression)', () => {
        expect(isToolCallContent({ content: 'directory' })).to.be.false;
    });

    it('rejects an object whose content is a nested object', () => {
        expect(isToolCallContent({ content: { nested: true } })).to.be.false;
    });

    it('rejects an object whose content is a number', () => {
        expect(isToolCallContent({ content: 42 })).to.be.false;
    });

    it('rejects an object whose content is null', () => {
        // eslint-disable-next-line no-null/no-null
        expect(isToolCallContent({ content: null })).to.be.false;
    });

    it('rejects a top-level array (no content key)', () => {
        expect(isToolCallContent([{ type: 'text', text: 'hello' }])).to.be.false;
    });

    it('rejects a directory-listing-shaped object containing a "content" entry (regression)', () => {
        const value = {
            '.devcontainer': 'directory',
            'config.yaml': 'file',
            'content': 'directory',
            'go.mod': 'file'
        };
        expect(isToolCallContent(value)).to.be.false;
    });

});
