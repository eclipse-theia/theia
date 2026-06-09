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
import {
    isCompactionResponsePart,
    isLanguageModelStreamResponsePart,
    isModelMatching,
    isToolCallContent,
    LanguageModel,
    LanguageModelSelector,
    resolveCompactionDefault,
    resolveServerSideCompaction
} from './language-model';

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

describe('compaction contract', () => {
    it('recognizes a compaction response part', () => {
        const part = { compaction: { provider: 'anthropic', data: { foo: 1 } } };
        expect(isCompactionResponsePart(part)).to.equal(true);
        expect(isLanguageModelStreamResponsePart(part)).to.equal(true);
    });
    it('rejects a non-compaction part', () => {
        expect(isCompactionResponsePart({ content: 'hi' })).to.equal(false);
        // eslint-disable-next-line no-null/no-null
        expect(isCompactionResponsePart(null)).to.equal(false);
        expect(isCompactionResponsePart(undefined)).to.equal(false);
        // eslint-disable-next-line no-null/no-null
        expect(isCompactionResponsePart({ compaction: null })).to.equal(false);
        expect(isCompactionResponsePart({ compaction: { provider: 42 } })).to.equal(false);
    });
    it('resolves a model default from the global preference and the per-provider override', () => {
        expect(resolveCompactionDefault(true, 'default')).to.equal(true);
        expect(resolveCompactionDefault(false, 'default')).to.equal(false);
        expect(resolveCompactionDefault(false, 'enabled')).to.equal(true);
        expect(resolveCompactionDefault(true, 'disabled')).to.equal(false);
    });
    it('resolves server-side compaction with capability gate and session-wins precedence', () => {
        // capability gate
        expect(resolveServerSideCompaction(false, true, { enabled: true })).to.equal(false);
        expect(resolveServerSideCompaction(undefined, true, undefined)).to.equal(false);
        // no per-session setting -> model default
        expect(resolveServerSideCompaction(true, true, undefined)).to.equal(true);
        expect(resolveServerSideCompaction(true, false, undefined)).to.equal(false);
        expect(resolveServerSideCompaction(true, true, {})).to.equal(true);
        // explicit per-session setting wins over the model default (which already folds in the per-provider override)
        expect(resolveServerSideCompaction(true, false, { enabled: true })).to.equal(true);
        expect(resolveServerSideCompaction(true, true, { enabled: false })).to.equal(false);
    });
});
