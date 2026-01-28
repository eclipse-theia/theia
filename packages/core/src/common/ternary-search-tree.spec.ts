// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { TernarySearchTree, KeySequenceIterator } from './ternary-search-tree';
import { KeyCode, KeySequence, Key, KeyModifier } from './keys';

describe('KeySequenceIterator', () => {
    let iterator: KeySequenceIterator;

    beforeEach(() => {
        iterator = new KeySequenceIterator();
    });

    it('should reset and iterate over a single key sequence', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        iterator.reset(keySequence);

        expect(iterator.value()).to.not.be.empty;
        expect(iterator.hasNext()).to.be.false;
    });

    it('should iterate over a multi-key sequence (chord)', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_K, modifiers: [KeyModifier.CtrlCmd] }),
            KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] })
        ];

        iterator.reset(keySequence);

        expect(iterator.hasNext()).to.be.true;
        const firstValue = iterator.value();
        expect(firstValue).to.not.be.empty;

        iterator.next();
        expect(iterator.hasNext()).to.be.false;
        const secondValue = iterator.value();
        expect(secondValue).to.not.be.empty;
        expect(secondValue).to.not.equal(firstValue);
    });

    it('should compare correctly with cmp()', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        iterator.reset(keySequence);
        const currentValue = iterator.value();

        // Same value should return 0
        expect(iterator.cmp(currentValue)).to.equal(0);

        // Different value should return non-zero
        expect(iterator.cmp('different')).to.not.equal(0);
    });
});

describe('TernarySearchTree for KeySequences', () => {
    let tree: TernarySearchTree<KeySequence, string>;

    beforeEach(() => {
        tree = TernarySearchTree.forKeySequences<string>();
    });

    it('should store and retrieve a single keybinding', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequence, 'command.a');

        expect(tree.get(keySequence)).to.equal('command.a');
    });

    it('should store and retrieve multiple keybindings', () => {
        const keySequenceA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const keySequenceB: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequenceA, 'command.a');
        tree.set(keySequenceB, 'command.b');

        expect(tree.get(keySequenceA)).to.equal('command.a');
        expect(tree.get(keySequenceB)).to.equal('command.b');
    });

    it('should store and retrieve chord keybindings', () => {
        const chordSequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_K, modifiers: [KeyModifier.CtrlCmd] }),
            KeyCode.createKeyCode({ first: Key.KEY_C, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(chordSequence, 'command.chord');

        expect(tree.get(chordSequence)).to.equal('command.chord');
    });

    it('should return undefined for non-existent keybindings', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_X, modifiers: [KeyModifier.CtrlCmd] })
        ];

        expect(tree.get(keySequence)).to.be.undefined;
    });

    it('should find superstrings (partial matches for chords)', () => {
        const prefixSequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_K, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const chordSequence1: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_K, modifiers: [KeyModifier.CtrlCmd] }),
            KeyCode.createKeyCode({ first: Key.KEY_C })
        ];
        const chordSequence2: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_K, modifiers: [KeyModifier.CtrlCmd] }),
            KeyCode.createKeyCode({ first: Key.KEY_D })
        ];

        tree.set(chordSequence1, 'command.kc');
        tree.set(chordSequence2, 'command.kd');

        // The prefix should find both chords as superstrings
        const superstrIterator = tree.findSuperstr(prefixSequence);
        expect(superstrIterator).to.not.be.undefined;

        const results: string[] = [];
        if (superstrIterator) {
            let result = superstrIterator.next();
            while (!result.done) {
                results.push(result.value);
                result = superstrIterator.next();
            }
        }

        expect(results).to.include('command.kc');
        expect(results).to.include('command.kd');
    });

    it('should not find superstrings when none exist', () => {
        const keySequenceA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const searchSequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequenceA, 'command.a');

        const superstrIterator = tree.findSuperstr(searchSequence);
        expect(superstrIterator).to.be.undefined;
    });

    it('should delete keybindings', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequence, 'command.a');
        expect(tree.get(keySequence)).to.equal('command.a');

        tree.delete(keySequence);
        expect(tree.get(keySequence)).to.be.undefined;
    });

    it('should clear all keybindings', () => {
        const keySequenceA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const keySequenceB: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequenceA, 'command.a');
        tree.set(keySequenceB, 'command.b');

        tree.clear();

        expect(tree.get(keySequenceA)).to.be.undefined;
        expect(tree.get(keySequenceB)).to.be.undefined;
    });

    it('should update existing keybinding value', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequence, 'command.original');
        expect(tree.get(keySequence)).to.equal('command.original');

        tree.set(keySequence, 'command.updated');
        expect(tree.get(keySequence)).to.equal('command.updated');
    });

    it('should iterate over all keybindings with forEach', () => {
        const keySequenceA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const keySequenceB: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_B, modifiers: [KeyModifier.CtrlCmd] })
        ];

        tree.set(keySequenceA, 'command.a');
        tree.set(keySequenceB, 'command.b');

        const results: string[] = [];
        tree.forEach(value => {
            results.push(value);
        });

        expect(results).to.have.lengthOf(2);
        expect(results).to.include('command.a');
        expect(results).to.include('command.b');
    });

    it('should handle keybindings with different modifiers', () => {
        const ctrlA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];
        const shiftA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Shift] })
        ];
        const altA: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.Alt] })
        ];

        tree.set(ctrlA, 'command.ctrl.a');
        tree.set(shiftA, 'command.shift.a');
        tree.set(altA, 'command.alt.a');

        expect(tree.get(ctrlA)).to.equal('command.ctrl.a');
        expect(tree.get(shiftA)).to.equal('command.shift.a');
        expect(tree.get(altA)).to.equal('command.alt.a');
    });

    it('should store arrays of bindings for the same key sequence', () => {
        const keySequence: KeySequence = [
            KeyCode.createKeyCode({ first: Key.KEY_A, modifiers: [KeyModifier.CtrlCmd] })
        ];

        const bindings = ['command.a1', 'command.a2', 'command.a3'];
        const arrayTree = TernarySearchTree.forKeySequences<string[]>();
        arrayTree.set(keySequence, bindings);

        const result = arrayTree.get(keySequence);
        expect(result).to.deep.equal(bindings);
        expect(result).to.have.lengthOf(3);
    });
});
