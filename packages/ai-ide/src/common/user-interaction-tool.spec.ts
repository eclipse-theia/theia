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
import { isEmptyContentRef, parseUserInteractionArgs, parseUserInteractionInput, resolveContentRef } from './user-interaction-tool';

describe('parseUserInteractionArgs', () => {
    it('should return undefined for undefined input', () => {
        expect(parseUserInteractionArgs(undefined)).to.be.undefined;
    });

    it('should return undefined for invalid JSON', () => {
        expect(parseUserInteractionArgs('not json')).to.be.undefined;
    });

    it('should return undefined when title is missing', () => {
        const input = JSON.stringify({ message: 'msg', options: [{ text: 'A', value: 'a' }] });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should return undefined when message is missing', () => {
        const input = JSON.stringify({ title: 'T', options: [{ text: 'A', value: 'a' }] });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should return undefined when options is not an array', () => {
        const input = JSON.stringify({ title: 'T', message: 'M', options: 'not-array' });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should return undefined when all options are invalid', () => {
        const input = JSON.stringify({ title: 'T', message: 'M', options: [{ foo: 'bar' }] });
        expect(parseUserInteractionArgs(input)).to.be.undefined;
    });

    it('should filter out invalid options', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }, { bad: true }, { text: 'B', value: 'b' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.options).to.have.length(2);
    });

    it('should parse valid args without links', () => {
        const input = JSON.stringify({
            title: 'Title', message: 'Message',
            options: [{ text: 'Yes', value: 'yes' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.deep.equal({
            title: 'Title', message: 'Message',
            options: [{ text: 'Yes', value: 'yes' }],
            links: undefined
        });
    });

    it('should normalize singular link to links array', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            link: { ref: 'src/index.ts' }
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.deep.equal([{ ref: 'src/index.ts' }]);
    });

    it('should parse plural links array', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [
                { ref: 'src/a.ts' },
                { ref: 'src/old.ts', rightRef: 'src/new.ts' }
            ]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.have.length(2);
        expect(result!.links![0]).to.deep.equal({ ref: 'src/a.ts' });
        expect(result!.links![1]).to.deep.equal({ ref: 'src/old.ts', rightRef: 'src/new.ts' });
    });

    it('should filter out invalid links from array', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [
                { ref: 'src/a.ts' },
                { noRef: true },
                { ref: '' } // empty ref string
            ]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].ref).to.equal('src/a.ts');
    });

    it('should set links to undefined when all links are invalid', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ noRef: true }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.be.undefined;
    });

    it('should ignore invalid singular link', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            link: { noRef: true }
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.be.undefined;
    });

    it('should prefer links array over singular link when both are present', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            link: { ref: 'singular.ts' },
            links: [{ ref: 'plural.ts' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].ref).to.equal('plural.ts');
    });

    it('should preserve buttonLabel in options', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'Confirm changes', value: 'confirm', buttonLabel: '✅ Confirm' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result).to.not.be.undefined;
        expect(result!.options[0].buttonLabel).to.equal('✅ Confirm');
    });
});

describe('resolveContentRef', () => {
    it('should resolve a string ref to an object with path', () => {
        expect(resolveContentRef('src/index.ts')).to.deep.equal({ path: 'src/index.ts' });
    });

    it('should return the object ref as-is', () => {
        const ref = { path: 'src/index.ts', gitRef: 'main', line: 42 };
        expect(resolveContentRef(ref)).to.deep.equal(ref);
    });

    it('should return an object ref without optional fields', () => {
        expect(resolveContentRef({ path: 'src/index.ts' })).to.deep.equal({ path: 'src/index.ts' });
    });

    it('should return an EmptyContentRef as-is', () => {
        const ref = { empty: true as const, label: 'New file' };
        expect(resolveContentRef(ref)).to.deep.equal({ empty: true, label: 'New file' });
    });

    it('should return an EmptyContentRef without label as-is', () => {
        expect(resolveContentRef({ empty: true as const })).to.deep.equal({ empty: true });
    });
});

describe('isEmptyContentRef', () => {
    it('should return true for an EmptyContentRef', () => {
        expect(isEmptyContentRef({ empty: true as const })).to.be.true;
    });

    it('should return true for an EmptyContentRef with label', () => {
        expect(isEmptyContentRef({ empty: true as const, label: 'Empty' })).to.be.true;
    });

    it('should return false for a string ref', () => {
        expect(isEmptyContentRef('src/index.ts')).to.be.false;
    });

    it('should return false for a PathContentRef', () => {
        expect(isEmptyContentRef({ path: 'src/index.ts' })).to.be.false;
    });

    it('should return false for an object with empty set to false', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(isEmptyContentRef({ empty: false } as any)).to.be.false;
    });
});

describe('parseUserInteractionArgs - ContentRef validation', () => {
    it('should accept links with string ref', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: 'src/file.ts' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].ref).to.equal('src/file.ts');
    });

    it('should accept links with object ref', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: { path: 'src/file.ts', gitRef: 'HEAD~1', line: 5 } }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].ref).to.deep.equal({ path: 'src/file.ts', gitRef: 'HEAD~1', line: 5 });
    });

    it('should accept links with EmptyContentRef', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: { empty: true, label: 'New file' } }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].ref).to.deep.equal({ empty: true, label: 'New file' });
    });

    it('should accept links with EmptyContentRef as rightRef', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: 'src/old.ts', rightRef: { empty: true } }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].rightRef).to.deep.equal({ empty: true });
    });

    it('should reject links with empty set to false', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: { empty: false } }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.be.undefined;
    });

    it('should reject links with empty string ref', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: '' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.be.undefined;
    });

    it('should reject links with empty path in object ref', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: { path: '' } }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.be.undefined;
    });

    it('should reject links with invalid rightRef', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: 'src/a.ts', rightRef: '' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.be.undefined;
    });

    it('should accept links with valid rightRef', () => {
        const input = JSON.stringify({
            title: 'T', message: 'M',
            options: [{ text: 'A', value: 'a' }],
            links: [{ ref: 'src/old.ts', rightRef: 'src/new.ts' }]
        });
        const result = parseUserInteractionArgs(input);
        expect(result!.links).to.have.length(1);
        expect(result!.links![0].rightRef).to.equal('src/new.ts');
    });
});

describe('parseUserInteractionInput', () => {
    it('should return empty title for undefined input', () => {
        expect(parseUserInteractionInput(undefined)).to.deep.equal({ title: '' });
    });

    it('should return empty title for empty string', () => {
        expect(parseUserInteractionInput('')).to.deep.equal({ title: '' });
    });

    it('should parse title from valid JSON', () => {
        const input = JSON.stringify({ title: 'My Title', message: 'Hello' });
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: 'My Title' });
    });

    it('should return empty title when title is not a string', () => {
        const input = JSON.stringify({ title: 42 });
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: '' });
    });

    it('should extract title from incomplete JSON via regex', () => {
        const input = '{"title": "Streaming Title", "message": "incom';
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: 'Streaming Title' });
    });

    it('should return empty title from incomplete JSON without title', () => {
        const input = '{"message": "no title here';
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: '' });
    });

    it('should handle title at end of incomplete JSON', () => {
        const input = '{"title":"Partial';
        expect(parseUserInteractionInput(input)).to.deep.equal({ title: 'Partial' });
    });
});
