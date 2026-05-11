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

import { isModelMatching, LanguageModel, LanguageModelSelector, isToolCallHtmlAppResult } from './language-model';
import { expect } from 'chai';

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

describe('isToolCallHtmlAppResult', () => {
    it('returns true for valid html app result', () => {
        expect(isToolCallHtmlAppResult({ type: 'html', html: '<div>Hello</div>' })).to.be.true;
    });

    it('returns true with optional title', () => {
        expect(isToolCallHtmlAppResult({ type: 'html', html: '<p>App</p>', title: 'My App' })).to.be.true;
    });

    it('returns false for text result', () => {
        expect(isToolCallHtmlAppResult({ type: 'text', text: 'hello' })).to.be.false;
    });

    it('returns false for missing html field', () => {
        expect(isToolCallHtmlAppResult({ type: 'html' })).to.be.false;
    });

    it('returns false for null', () => {
        expect(isToolCallHtmlAppResult(null)).to.be.false;
    });

    it('returns false for undefined', () => {
        expect(isToolCallHtmlAppResult(undefined)).to.be.false;
    });
});
