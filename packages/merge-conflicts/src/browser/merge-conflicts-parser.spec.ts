/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { MergeConflictsParser } from './merge-conflicts-parser';
import { Range, Position } from '@theia/editor/lib/browser';
import { MergeConflict } from './merge-conflict';

let parser: MergeConflictsParser;

beforeAll(() => {
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

describe("merge-conflict-parser", () => {

    test("simple merge conflict", () => {
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
        expect(conflicts).toHaveLength(1);
        const conflict = conflicts[0];
        expect(conflict.total).toBeDefined();
        expect(conflict.current.marker).toBeDefined();
        expect(conflict.current.content).toBeDefined();
        expect(conflict.incoming.marker).toBeDefined();
        expect(conflict.incoming.content).toBeDefined();
    });

    test("content regions are correct", () => {
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
        expect(conflicts).toHaveLength(1);
        const conflict = conflicts[0];

        const total = conflict.total!;
        expect(total).toEqual({
            start: { line: 1, character: 0 },
            end: { line: 10, character: 14 }
        });
        expect(substring(content, total)).toEqual(`<<<<<<< HEAD
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
        expect(currentContent).toEqual({
            start: { line: 2, character: 0 },
            end: { line: 3, character: 21 }
        });
        expect(substring(content, currentContent)).toEqual(`foo changed on master
bar changed on master`);

        const baseContent = conflict.bases[0].content!;
        expect(baseContent).toEqual({
            start: { line: 5, character: 0 },
            end: { line: 6, character: 3 }
        });
        expect(substring(content, baseContent)).toEqual(`foo
bar`);

        const incomingContent = conflict.incoming.content!;
        expect(incomingContent).toEqual({
            start: { line: 8, character: 0 },
            end: { line: 9, character: 13 }
        });
        expect(substring(content, incomingContent)).toEqual(`foo on branch
bar on branch`);
    });

    test("multiple merge conflicts", () => {
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
        expect(conflicts).toHaveLength(3);
    });

    test("merge conflict with bases", () => {
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
        expect(conflicts).toHaveLength(1);
        const conflict = conflicts[0];

        const bases = conflict.bases;
        expect(bases).toHaveLength(3);

        const base1Content = bases[0].content;
        expect(base1Content).toBeDefined();
        expect(base1Content).toEqual({
            start: { line: 4, character: 0 },
            end: { line: 4, character: 13 }
        });

        const base2Content = bases[1].content;
        expect(base2Content).toBeUndefined();

        const base3Content = bases[2].content;
        expect(base3Content).toBeDefined();
        expect(base3Content).toEqual({
            start: { line: 7, character: 0 },
            end: { line: 7, character: 13 }
        });
    });

    test("broken 1: second current marker in current content", () => {
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
        expect(conflicts).toHaveLength(1);
        const conflict = conflicts[0];

        const total = conflict.total;
        expect(total).toBeDefined();
        expect(total).toEqual({
            start: { line: 1, character: 0 },
            end: { line: 7, character: 14 }
        });
    });

    test("broken 2: current marker in incoming content", () => {
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
        expect(conflicts).toHaveLength(0);
    });

    test("broken 3: second separator", () => {
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
        expect(conflicts).toHaveLength(0);
    });

    test("broken 4: second separator in incoming content", () => {
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
        expect(conflicts).toHaveLength(0);
    });

    test("broken 5: incoming marker, no separator", () => {
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
        expect(conflicts).toHaveLength(1);
        const conflict = conflicts[0];

        const total = conflict.total;
        expect(total).toBeDefined();
        expect(total).toEqual({
            start: { line: 7, character: 0 },
            end: { line: 13, character: 14 }
        });
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
