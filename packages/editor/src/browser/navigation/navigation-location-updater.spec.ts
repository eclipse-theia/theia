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

import { expect } from 'chai';
import { NavigationLocation, Range } from './navigation-location';
import { TextDocumentContentChangeDelta } from '../editor';
import { MockNavigationLocationUpdater } from './test/mock-navigation-location-updater';

// tslint:disable:no-unused-expression

describe('navigation-location-updater', () => {

    const updater = new MockNavigationLocationUpdater();

    describe('contained', () => {
        ([
            [{ start: { line: 4, character: 3 }, end: { line: 4, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 6, character: 12 } }, true],
            [{ start: { line: 4, character: 3 }, end: { line: 5, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 6, character: 12 } }, true],
            [{ start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, true],
            [{ start: { line: 3, character: 2 }, end: { line: 3, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, false],
            [{ start: { line: 2, character: 3 }, end: { line: 3, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, false],
            [{ start: { line: 3, character: 3 }, end: { line: 3, character: 13 } }, { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, false],
            [{ start: { line: 3, character: 3 }, end: { line: 4, character: 12 } }, { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } }, false],
        ] as [Range, Range, boolean][]).forEach(test => {
            const [subRange, range, expected] = test;
            it(`range ${JSON.stringify(range)} should${!expected ? ' not' : ''} be contained in range ${JSON.stringify(subRange)}`, () => {
                expect(updater.contained(subRange, range)).to.be.equal(expected);
            });
        });
    });

    describe('affected', () => {

        it('should never affect a location if they belong to different resources', () => {
            const actual = updater.affects(
                NavigationLocation.create('file:///a', { line: 0, character: 0, }),
                NavigationLocation.create('file:///b', { line: 0, character: 0, })
            );
            expect(actual).to.be.false;
        });

        ([
            // Spec(1. and 2.)
            {
                candidate: { start: { line: 3, character: 3 }, end: { line: 3, character: 12 } },
                other: { range: { start: { line: 1, character: 6 }, end: { line: 3, character: 2 } }, rangeLength: 78, text: 'x' },
                expected: { start: { line: 1, character: 8 }, end: { line: 1, character: 17 } }
            },
            {
                candidate: { start: { line: 3, character: 3 }, end: { line: 4, character: 18 } },
                other: { range: { start: { line: 1, character: 6 }, end: { line: 3, character: 2 } }, rangeLength: 78, text: 'x' },
                expected: { start: { line: 1, character: 8 }, end: { line: 2, character: 18 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 3, character: 26 } },
                other: { range: { start: { line: 1, character: 3 }, end: { line: 1, character: 12 } }, rangeLength: 9, text: 'x' },
                expected: false
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 3, character: 26 } },
                other: { range: { start: { line: 1, character: 3 }, end: { line: 1, character: 12 } }, rangeLength: 9, text: 'a\n\b\nc' },
                expected: { start: { line: 5, character: 17 }, end: { line: 5, character: 26 } }
            },
            // Spec (3.)
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 3, character: 26 } },
                other: { range: { start: { line: 3, character: 18 }, end: { line: 3, character: 24 } }, rangeLength: 6, text: 'x' },
                expected: { start: { line: 3, character: 17 }, end: { line: 3, character: 21 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 3, character: 26 } },
                other: { range: { start: { line: 3, character: 18 }, end: { line: 3, character: 23 } }, rangeLength: 5, text: 'a\n\b\nc' },
                expected: { start: { line: 3, character: 17 }, end: { line: 5, character: 4 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 3, character: 19 }, end: { line: 4, character: 19 } }, rangeLength: 41, text: 'xxx' },
                expected: { start: { line: 3, character: 17 }, end: { line: 3, character: 29 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 3, character: 19 }, end: { line: 3, character: 21 } }, rangeLength: 2, text: 'a\nb' },
                expected: { start: { line: 3, character: 17 }, end: { line: 5, character: 26 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 3, character: 18 }, end: { line: 4, character: 24 } }, rangeLength: 47, text: 'a\nb\nc' },
                expected: { start: { line: 3, character: 17 }, end: { line: 5, character: 3 } }
            },
            // Spec (4.)
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 6, character: 13 }, end: { line: 6, character: 23 } }, rangeLength: 10, text: '' },
                expected: false
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 6, character: 13 }, end: { line: 6, character: 23 } }, rangeLength: 10, text: 'a\nb\nc' },
                expected: false
            },
            // Spec (5.)
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } }, rangeLength: 50, text: '' },
                expected: { start: { line: 3, character: 17 }, end: { line: 3, character: 17 } }
            },
            {
                candidate: { start: { line: 3, character: 17 }, end: { line: 4, character: 26 } },
                other: { range: { start: { line: 3, character: 17 }, end: { line: 4, character: 27 } }, rangeLength: 51, text: '' },
                expected: undefined
            },
        ] as TestInput[]).forEach(test => {
            const { other, expected, candidate } = test;
            it(`should update the navigation location: ${JSON.stringify(candidate)} => ${JSON.stringify(expected)}`, () => {
                if (test.trace) {
                    trace(test);
                }
                const actual = updater.affects(
                    NavigationLocation.create('file:///a', candidate),
                    NavigationLocation.create('file:///a', other),
                );
                if (typeof expected === 'boolean') {
                    expect(actual).to.be.deep.equal(expected);
                } else if (expected === undefined) {
                    expect(actual).to.be.undefined;
                } else {
                    // tslint:disable-next-line:no-any
                    expect((actual as any).context).to.be.deep.equal(expected);
                }
            });
        });

    });

});

interface TestInput {
    readonly candidate: Range;
    readonly other: TextDocumentContentChangeDelta;
    // affected | not affected | should be deleted
    readonly expected: Range | false | undefined;
    readonly trace?: true;
}

function trace(test: TestInput): void {
    const line = 10;
    const column = 40;
    const doc: string[][] = [];
    const printDoc = (text?: string) => {
        if (text) {
            console.log(`\n     START - ${text}     `);
        }
        doc.forEach(row => console.log(row.join('')));
        if (text) {
            console.log(`      END - ${text}      \n`);
        }
    };
    const select = (range: Range, p: string) => {
        for (let i = range.start.line + 1; i < range.end.line; i++) {
            for (let j = 0; j < column; j++) {
                doc[i][j] = p;
            }
        }
        if (range.start.line === range.end.line) {
            for (let j = range.start.character; j < range.end.character; j++) {
                doc[range.start.line][j] = p;
            }
        } else {
            for (let j = range.start.character; j < column; j++) {
                doc[range.start.line][j] = p;
            }
            for (let j = 0; j < range.end.character; j++) {
                doc[range.end.line][j] = p;
            }
        }
    };
    for (let i = 0; i < line; i++) {
        doc.push(Array(column).fill('+'));
    }
    printDoc('EMPTY DOCUMENT');
    select(test.candidate, '_');
    printDoc('CANDIDATE SELECTION');
    select(test.other.range, 'a');
    printDoc('APPLIED MODIFICATION');
    // TODO: Show the "doc" after applying the changes.
}
