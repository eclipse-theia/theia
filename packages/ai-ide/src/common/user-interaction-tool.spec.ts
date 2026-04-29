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
import { parseUserInteractionArgs, parseUserInteractionInput } from './user-interaction-tool';

describe('parseUserInteractionArgs', () => {
    it('should return undefined for undefined input', () => {
        expect(parseUserInteractionArgs(undefined)).to.be.undefined;
    });

    it('should return undefined for invalid JSON', () => {
        expect(parseUserInteractionArgs('not json')).to.be.undefined;
    });

    it('should return undefined when interactions is missing', () => {
        const input = JSON.stringify({ foo: 'bar' });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should return undefined when interactions is not an array', () => {
        const input = JSON.stringify({ interactions: 'nope' });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should return undefined when no step is valid', () => {
        const input = JSON.stringify({ interactions: [{ foo: 'bar' }, { title: 1 }] });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should drop steps that are missing title or message', () => {
        const input = JSON.stringify({
            interactions: [
                { title: 'Valid', message: 'Hello' },
                { title: 'No message' },
                { message: 'No title' }
            ]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.interactions).to.have.length(1);
        expect(result!.interactions[0].title).to.equal('Valid');
    });

    it('should accept a step without options (informational)', () => {
        const input = JSON.stringify({
            interactions: [{ title: 'Info', message: 'Just so you know' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.interactions[0].options).to.be.undefined;
    });

    it('should filter out invalid options within a step', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ text: 'A', value: 'a' }, { bad: true }, { text: 'B', value: 'b' }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].options).to.have.length(2);
    });

    it('should drop options array if no options are valid', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ bad: true }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].options).to.be.undefined;
    });

    it('should normalize singular link into a links array on a step', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ text: 'A', value: 'a' }],
                link: { ref: 'src/index.ts' }
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links).to.deep.equal([{ ref: 'src/index.ts' }]);
    });

    it('should accept a links array with multiple entries', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ text: 'A', value: 'a' }],
                links: [
                    { ref: 'src/a.ts' },
                    { ref: 'src/old.ts', rightRef: 'src/new.ts' }
                ]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links).to.have.length(2);
    });

    it('should filter out invalid links from a step', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ text: 'A', value: 'a' }],
                links: [
                    { ref: 'src/a.ts' },
                    { noRef: true },
                    { ref: '' }
                ]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links).to.have.length(1);
    });

    it('should accept multiple steps in order', () => {
        const input = JSON.stringify({
            interactions: [
                { title: 'Overview', message: 'PR summary' },
                { title: 'Area 1', message: 'finding', options: [{ text: 'OK', value: 'approve' }] },
                { title: 'Area 2', message: 'no findings' }
            ]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions).to.have.length(3);
        expect(result!.interactions[1].options).to.have.length(1);
        expect(result!.interactions[2].options).to.be.undefined;
    });

    it('should preserve buttonLabel in options', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                options: [{ text: 'Confirm changes', value: 'confirm', buttonLabel: '✅ Confirm' }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].options![0].buttonLabel).to.equal('✅ Confirm');
    });

    it('should reject step links with empty path in object ref', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                links: [{ ref: { path: '' } }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links).to.be.undefined;
    });

    it('should accept step links with EmptyContentRef', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                links: [{ ref: { empty: true, label: 'New file' } }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links![0].ref).to.deep.equal({ empty: true, label: 'New file' });
    });

    it('should accept step links with EmptyContentRef as rightRef', () => {
        const input = JSON.stringify({
            interactions: [{
                title: 'T', message: 'M',
                links: [{ ref: 'src/old.ts', rightRef: { empty: true } }]
            }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.interactions[0].links![0].rightRef).to.deep.equal({ empty: true });
    });
});

describe('parseUserInteractionInput', () => {
    it('should return empty result for undefined input', () => {
        expect(parseUserInteractionInput(undefined)).to.deep.equal({ title: '', stepCount: 0 });
    });

    it('should return empty result for empty string', () => {
        expect(parseUserInteractionInput('')).to.deep.equal({ title: '', stepCount: 0 });
    });

    it('should extract first step title and step count from valid JSON', () => {
        const input = JSON.stringify({ interactions: [{ title: 'First' }, { title: 'Second' }] });
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: 'First', stepCount: 2 });
    });

    it('should return empty title and 0 count when interactions array is empty', () => {
        const input = JSON.stringify({ interactions: [] });
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: '', stepCount: 0 });
    });

    it('should fall back to regex-based title extraction for incomplete JSON', () => {
        const input = '{"interactions": [{"title": "Streaming Title", "message": "incom';
        expect(parseUserInteractionInput(input).title).to.equal('Streaming Title');
    });

    it('should return empty title from incomplete JSON without title field', () => {
        const input = '{"interactions": [{"message": "no title here';
        expect(parseUserInteractionInput(input).title).to.equal('');
    });
});
