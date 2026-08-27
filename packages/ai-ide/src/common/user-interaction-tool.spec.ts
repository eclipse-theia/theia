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
import { UserInteractionArgs, buildDiffLabel, parseUserInteractionArgs, parseUserInteractionInput } from './user-interaction-tool';

function expectRejected(input: string | undefined): string {
    const result = parseUserInteractionArgs(input);
    expect(result.ok, `expected a rejection but got: ${JSON.stringify(result)}`).to.be.false;
    return (result as { ok: false, error: string }).error;
}

function expectAccepted(input: string): UserInteractionArgs {
    const result = parseUserInteractionArgs(input);
    expect(result.ok, `expected acceptance but got: ${JSON.stringify(result)}`).to.be.true;
    return (result as { ok: true, args: UserInteractionArgs }).args;
}

describe('parseUserInteractionArgs', () => {

    describe('rejecting malformed arguments', () => {

        it('should reject undefined input', () => {
            expect(expectRejected(undefined)).to.match(/no arguments/i);
        });

        it('should reject input that is not valid JSON', () => {
            expect(expectRejected('not json')).to.match(/valid JSON/i);
        });

        it('should reject arguments without an interactions property', () => {
            expect(expectRejected(JSON.stringify({ foo: 'bar' }))).to.match(/"interactions" must be an array of step objects/);
        });

        it('should reject a JSON-encoded interactions string and name the received type', () => {
            const error = expectRejected(JSON.stringify({ interactions: '[{"title":"T","message":"M"}]' }));
            expect(error).to.match(/"interactions" must be an array of step objects, received string/);
            expect(error).to.match(/do not JSON-encode nested values/i);
        });

        it('should reject an empty interactions array', () => {
            expect(expectRejected(JSON.stringify({ interactions: [] }))).to.match(/at least one step/);
        });

        it('should reject a step that is missing its message, naming the step position', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [{ title: 'Valid', message: 'Hello' }, { title: 'No message' }]
            }));
            expect(error).to.match(/step 2: "title" and "message" are required strings/i);
        });

        it('should reject a step that is missing its title, naming the step position', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [{ message: 'No title' }]
            }));
            expect(error).to.match(/step 1: "title" and "message" are required strings/i);
        });

        it('should reject a step whose options are a JSON-encoded string', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [{ title: 'Apply fix?', message: 'M', options: '[{"text":"Yes","value":"yes"}]' }]
            }));
            expect(error).to.match(/step 1: "options" must be an array of \{text, value\} objects, received string/i);
            expect(error).to.match(/do not JSON-encode nested values/i);
        });

        it('should reject a step when a single option is malformed, even though others are valid', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    options: [{ text: 'A', value: 'a' }, { label: 'B', value: 'b' }, { text: 'C', value: 'c' }]
                }]
            }));
            expect(error).to.match(/step 1, option 2: "text" and "value" are required strings/i);
        });

        it('should reject plain string options', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [{ title: 'T', message: 'M', options: ['Yes', 'No'] }]
            }));
            expect(error).to.match(/step 1, option 1: "text" and "value" are required strings/i);
        });

        it('should report the offending option position within the offending step', () => {
            const error = expectRejected(JSON.stringify({
                interactions: [
                    { title: 'Fine', message: 'M', options: [{ text: 'A', value: 'a' }] },
                    { title: 'Broken', message: 'M', options: [{ text: 'A', value: 'a' }, { text: 'B' }] }
                ]
            }));
            expect(error).to.match(/step 2, option 2: "text" and "value" are required strings/i);
        });
    });

    describe('accepting well-formed arguments', () => {

        it('should accept a step without options (informational)', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{ title: 'Info', message: 'Just so you know' }]
            }));
            expect(args.interactions[0].options).to.be.undefined;
        });

        it('should accept an explicitly empty options array as informational', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{ title: 'Info', message: 'Just so you know', options: [] }]
            }));
            expect(args.interactions[0].options).to.be.undefined;
        });

        it('should accept multiple steps in order', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [
                    { title: 'Overview', message: 'PR summary' },
                    { title: 'Area 1', message: 'finding', options: [{ text: 'OK', value: 'approve' }] },
                    { title: 'Area 2', message: 'no findings' }
                ]
            }));
            expect(args.interactions).to.have.length(3);
            expect(args.interactions[1].options).to.have.length(1);
            expect(args.interactions[2].options).to.be.undefined;
        });

        it('should preserve buttonLabel and description in options', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    options: [{ text: 'Confirm changes', value: 'confirm', description: 'Applies the patch', buttonLabel: '✅ Confirm' }]
                }]
            }));
            expect(args.interactions[0].options![0].buttonLabel).to.equal('✅ Confirm');
            expect(args.interactions[0].options![0].description).to.equal('Applies the patch');
        });
    });

    describe('links remain leniently filtered', () => {

        it('should normalize a singular link into a links array on a step', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    options: [{ text: 'A', value: 'a' }],
                    link: { ref: 'src/index.ts' }
                }]
            }));
            expect(args.interactions[0].links).to.deep.equal([{ ref: 'src/index.ts' }]);
        });

        it('should accept a links array with multiple entries', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    links: [{ ref: 'a.ts' }, { ref: 'b.ts', label: 'B' }]
                }]
            }));
            expect(args.interactions[0].links).to.have.length(2);
        });

        it('should drop invalid links from a step without rejecting the step', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    links: [{ ref: 'a.ts' }, { nope: true }, { ref: 42 }]
                }]
            }));
            expect(args.interactions[0].links).to.have.length(1);
        });

        it('should ignore invalid rightRef placeholders and keep multi-step file links', () => {
            const emptyRightRefPlaceholder = {
                path: '',
                gitRef: '',
                line: 0,
                empty: false,
                label: ''
            };
            const args = expectAccepted(JSON.stringify({
                interactions: ['README.md', 'package.json', 'CONTRIBUTING.md'].map((path, index) => ({
                    title: `File link: ${path}`,
                    message: 'Open the file link.',
                    links: [{
                        ref: { path, gitRef: '', line: 1, empty: false, label: '' },
                        rightRef: emptyRightRefPlaceholder,
                        label: `Open ${path}`,
                        autoOpen: index === 0
                    }]
                }))
            }));
            expect(args.interactions.map(step => step.links![0])).to.deep.equal([
                { ref: { path: 'README.md', line: 1 }, label: 'Open README.md', autoOpen: true },
                { ref: { path: 'package.json', line: 1 }, label: 'Open package.json', autoOpen: false },
                { ref: { path: 'CONTRIBUTING.md', line: 1 }, label: 'Open CONTRIBUTING.md', autoOpen: false }
            ]);
        });

        it('should reject step links with empty path in object ref', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    links: [{ ref: { path: '' } }]
                }]
            }));
            expect(args.interactions[0].links).to.be.undefined;
        });

        it('should accept step links with EmptyContentRef', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    links: [{ ref: { empty: true, label: 'New file' } }]
                }]
            }));
            expect(args.interactions[0].links![0].ref).to.deep.equal({ empty: true, label: 'New file' });
        });

        it('should accept step links with EmptyContentRef as rightRef', () => {
            const args = expectAccepted(JSON.stringify({
                interactions: [{
                    title: 'T', message: 'M',
                    links: [{ ref: 'src/old.ts', rightRef: { empty: true } }]
                }]
            }));
            expect(args.interactions[0].links![0].rightRef).to.deep.equal({ empty: true });
        });
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
        const partial = '{"interactions":[{"title":"Streaming ti';
        expect(parseUserInteractionInput(partial)).to.deep.equal({ title: 'Streaming ti', stepCount: 0 });
    });

    it('should return empty title from incomplete JSON without title field', () => {
        const partial = '{"interactions":[{"mes';
        expect(parseUserInteractionInput(partial)).to.deep.equal({ title: '', stepCount: 0 });
    });
});

describe('buildDiffLabel', () => {
    it('formats two empty refs', () => {
        expect(buildDiffLabel({ empty: true, label: 'before' }, { empty: true, label: 'after' }))
            .to.equal('before ⟷ after');
    });

    it('formats empty left vs path with gitRef', () => {
        expect(buildDiffLabel({ empty: true, label: 'new file' }, { path: 'src/a.ts', gitRef: 'abcdef1234567' }))
            .to.equal('src/a.ts (new file ⟷ abcdef1)');
    });

    it('formats path with gitRef vs working copy of same path', () => {
        expect(buildDiffLabel({ path: 'src/a.ts', gitRef: 'abcdef1234567' }, { path: 'src/a.ts' }))
            .to.equal('src/a.ts (abcdef1 ⟷ Working Copy)');
    });

    it('formats two different paths', () => {
        expect(buildDiffLabel({ path: 'src/a.ts' }, { path: 'src/b.ts' }))
            .to.equal('src/a.ts ⟷ src/b.ts');
    });
});
