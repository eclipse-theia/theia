/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as chai from 'chai';
import { expect } from 'chai';
chai.use(require('chai-string'));

import { MergeConflictsParser } from './merge-conflicts-parser';
import { Range, Position } from '@theia/editor/lib/browser';
import { MergeConflict } from './merge-conflict';

let parser: MergeConflictsParser;

before(() => {
    parser = new MergeConflictsParser();
});

// tslint:disable:no-unused-expression

function parse(contents: string): MergeConflict[] {
    const splitted = contents.split('\n');
    const input = <MergeConflictsParser.Input>{
        lineCount: splitted.length,
        getLine: lineNumber => splitted[lineNumber],
    };
    return parser.parse(input);
}

describe('merge-conflict-parser', () => {

    it('simple merge conflict', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];
        expect(conflict.total).to.not.be.undefined;
        expect(conflict.current.marker).to.not.be.undefined;
        expect(conflict.current.content).to.not.be.undefined;
        expect(conflict.incoming.marker).to.not.be.undefined;
        expect(conflict.incoming.content).to.not.be.undefined;
    });

    it('content regions are correct', () => {
        const content = `first line
<<<<<<< HEAD
foo changed on master
bar changed on master
||||||| base 1
foo
bar
=======
foo on branch
bar on branch
>>>>>>> branch
last line`;
        const conflicts = parse(content);
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        const total = conflict.total!;
        expect(total, 'total range').to.deep.equal({
            start: { line: 1, character: 0 },
            end: { line: 10, character: 14 }
        });
        expect(substring(content, total)).to.equal(`<<<<<<< HEAD
foo changed on master
bar changed on master
||||||| base 1
foo
bar
=======
foo on branch
bar on branch
>>>>>>> branch`);

        const currentContent = conflict.current.content!;
        expect(currentContent).to.deep.equal({
            start: { line: 2, character: 0 },
            end: { line: 3, character: 21 }
        });
        expect(substring(content, currentContent)).to.equal(`foo changed on master
bar changed on master`);

        const baseContent = conflict.bases[0].content!;
        expect(baseContent).to.deep.equal({
            start: { line: 5, character: 0 },
            end: { line: 6, character: 3 }
        });
        expect(substring(content, baseContent)).to.equal(`foo
bar`);

        const incomingContent = conflict.incoming.content!;
        expect(incomingContent).to.deep.equal({
            start: { line: 8, character: 0 },
            end: { line: 9, character: 13 }
        });
        expect(substring(content, incomingContent)).to.equal(`foo on branch
bar on branch`);
    });

    it('multiple merge conflicts', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch

<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch

<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch`
        );
        expect(conflicts).to.have.lengthOf(3);
    });

    it('merge conflict with bases', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
||||||| base 1
common base 1
||||||| base 2
||||||| base 3
common base 3
=======
foo on branch
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        const bases = conflict.bases;
        expect(bases).to.have.lengthOf(3);

        const base1Content = bases[0].content;
        expect(base1Content).to.not.be.undefined;
        expect(base1Content).to.deep.equal({
            start: { line: 4, character: 0 },
            end: { line: 4, character: 13 }
        });

        const base2Content = bases[1].content;
        expect(base2Content).to.be.undefined;

        const base3Content = bases[2].content;
        expect(base3Content).to.not.be.undefined;
        expect(base3Content).to.deep.equal({
            start: { line: 7, character: 0 },
            end: { line: 7, character: 13 }
        });
    });

    it('broken 1: second current marker in current content', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        const total = conflict.total;
        expect(total).to.not.be.undefined;
        expect(total).to.deep.equal({
            start: { line: 1, character: 0 },
            end: { line: 7, character: 14 }
        });
    });

    it('broken 2: current marker in incoming content', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
<<<<<<< HEAD
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(0);
    });

    it('broken 3: second separator', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
=======
=======
foo on branch
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(0);
    });

    it('broken 4: second separator in incoming content', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
=======
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(0);
    });

    it('broken 5: incoming marker, no separator', () => {
        const conflicts = parse(
            `<<<<<<< HEAD
foo changed on master
bar changed on master
foo on branch
bar on branch
>>>>>>> branch

<<<<<<< HEAD
foo changed on master
bar changed on master
=======
foo on branch
bar on branch
>>>>>>> branch
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        const total = conflict.total;
        expect(total).to.not.be.undefined;
        expect(total).to.deep.equal({
            start: { line: 7, character: 0 },
            end: { line: 13, character: 14 }
        });
    });

    it('merge conflict with empty incoming change', () => {
        const conflicts = parse(
            `<<<<<<<
a
|||||||
b
=======
>>>>>>>
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        expect(conflict.incoming).to.not.be.undefined;
        expect(conflict.incoming.content).to.be.undefined;
    });

    it('merge conflict with empty current change', () => {
        const conflicts = parse(
            `<<<<<<<
|||||||
b
=======
a
>>>>>>>
`
        );
        expect(conflicts).to.have.lengthOf(1);
        const conflict = conflicts[0];

        expect(conflict.current).to.not.be.undefined;
        expect(conflict.current.content).to.be.undefined;
    });

});

function substring(text: string, range: Range): string {
    const lines = text.split(/\r?\n|\r/);
    const lineOffsets = [0];
    for (let i = 1; i < lines.length; i++) {
        lineOffsets[i] = lineOffsets[i - 1] + lines[i - 1].length + 1;
    }
    const offsetAt = (position: Position) => lineOffsets[position.line] + position.character;
    const startOffset = offsetAt(range.start);
    const endOffset = offsetAt(range.end);
    const result = text.substring(startOffset, endOffset);
    return result;
}
