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

import * as assert from 'assert';
import { deepMergeApiNamespaces, DeepMerge } from './merge-api-namespaces';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('deepMergeApiNamespaces', () => {

    describe('shallow merge of disjoint keys', () => {
        it('should combine properties from both objects', () => {
            const target = { a: 1, b: 'hello' };
            const source = { c: true, d: 42 };
            const result = deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual(result, { a: 1, b: 'hello', c: true, d: 42 });
        });

        it('should return an empty object when both inputs are empty', () => {
            const result = deepMergeApiNamespaces({}, {});
            assert.deepStrictEqual(result, {});
        });

        it('should return source properties when target is empty', () => {
            const result = deepMergeApiNamespaces({}, { x: 10 });
            assert.deepStrictEqual(result, { x: 10 });
        });

        it('should return target properties when source is empty', () => {
            const result = deepMergeApiNamespaces({ x: 10 }, {});
            assert.deepStrictEqual(result, { x: 10 });
        });
    });

    describe('source overrides target for non-object values', () => {
        it('should let source override target for primitive values', () => {
            const result = deepMergeApiNamespaces({ a: 1 }, { a: 2 });
            assert.strictEqual(result.a, 2);
        });

        it('should let source override target when types differ', () => {
            const result = deepMergeApiNamespaces(
                { a: 'string' } as Record<string, unknown>,
                { a: 42 } as Record<string, unknown>
            );
            assert.strictEqual(result.a, 42);
        });

        it('should let source override target for function values', () => {
            const fn1 = (): number => 1;
            const fn2 = (): number => 2;
            const result = deepMergeApiNamespaces({ doStuff: fn1 }, { doStuff: fn2 });
            assert.strictEqual(result.doStuff, fn2);
        });
    });

    describe('deep merge of nested plain objects', () => {
        it('should recursively merge nested plain objects', () => {
            const target = { window: { showTextDocument: 'a', activeTextEditor: 'b' } };
            const source = { window: { createTerminal: 'c', terminals: 'd' } };
            const result = deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual(result, {
                window: {
                    showTextDocument: 'a',
                    activeTextEditor: 'b',
                    createTerminal: 'c',
                    terminals: 'd'
                }
            });
        });

        it('should merge deeply nested objects', () => {
            const target = { a: { b: { c: 1 } } };
            const source = { a: { b: { d: 2 } } };
            const result = deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual(result, { a: { b: { c: 1, d: 2 } } });
        });

        it('should let source override within nested objects', () => {
            const target = { window: { theme: 'dark', fontSize: 12 } };
            const source = { window: { theme: 'light' } };
            const result = deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual(result, { window: { theme: 'light', fontSize: 12 } });
        });

        it('should not mutate target or source', () => {
            const target = { window: { a: 1 } };
            const source = { window: { b: 2 } };
            deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual(target, { window: { a: 1 } });
            assert.deepStrictEqual(source, { window: { b: 2 } });
        });
    });

    describe('getter preservation', () => {
        it('should preserve getters from target as lazy accessors', () => {
            let callCount = 0;
            const target = Object.defineProperty({}, 'activeEditor', {
                get(): string {
                    callCount++;
                    return 'editor1';
                },
                enumerable: true,
                configurable: true
            });
            const source = { someOtherProp: 42 };

            callCount = 0;
            const result = deepMergeApiNamespaces(target, source);

            // The getter should not have been invoked during merge
            assert.strictEqual(callCount, 0);
            // Accessing the property should invoke the getter
            assert.strictEqual((result as any).activeEditor, 'editor1');
            assert.strictEqual(callCount, 1);
        });

        it('should preserve getters from source as lazy accessors', () => {
            let callCount = 0;
            const target = { someOtherProp: 42 };
            const source = Object.defineProperty({}, 'activeTerminal', {
                get(): string {
                    callCount++;
                    return 'terminal1';
                },
                enumerable: true,
                configurable: true
            });

            callCount = 0;
            const result = deepMergeApiNamespaces(target, source);

            assert.strictEqual(callCount, 0);
            assert.strictEqual((result as any).activeTerminal, 'terminal1');
            assert.strictEqual(callCount, 1);
        });

        it('should preserve getters from both sides within a merged namespace', () => {
            let editorCalls = 0;
            let terminalCalls = 0;

            const target = {
                window: Object.defineProperty({}, 'activeEditor', {
                    get(): string { editorCalls++; return 'editor'; },
                    enumerable: true, configurable: true
                })
            };
            const source = {
                window: Object.defineProperty({}, 'activeTerminal', {
                    get(): string { terminalCalls++; return 'terminal'; },
                    enumerable: true, configurable: true
                })
            };

            editorCalls = 0;
            terminalCalls = 0;
            const result = deepMergeApiNamespaces(target, source);

            // Neither getter should have been called during merge
            assert.strictEqual(editorCalls, 0);
            assert.strictEqual(terminalCalls, 0);

            // Both should work when accessed
            assert.strictEqual((result as any).window.activeEditor, 'editor');
            assert.strictEqual((result as any).window.activeTerminal, 'terminal');
            assert.strictEqual(editorCalls, 1);
            assert.strictEqual(terminalCalls, 1);
        });

        it('should let a source getter override a target getter', () => {
            const target = Object.defineProperty({}, 'value', {
                get(): string { return 'old'; },
                enumerable: true, configurable: true
            });
            const source = Object.defineProperty({}, 'value', {
                get(): string { return 'new'; },
                enumerable: true, configurable: true
            });
            const result = deepMergeApiNamespaces(target, source);
            assert.strictEqual((result as any).value, 'new');
        });
    });

    describe('class instances are not recursively merged', () => {
        it('should treat class instances as leaves (source wins)', () => {
            class MyClass {
                constructor(public value: number) { }
            }
            const instance1 = new MyClass(1);
            const instance2 = new MyClass(2);
            const target = { obj: instance1 };
            const source = { obj: instance2 };
            const result = deepMergeApiNamespaces(target, source);
            assert.strictEqual((result as any).obj, instance2);
        });

        it('should not recurse into class instances even if they have overlapping keys', () => {
            class Position {
                constructor(public line: number, public character: number) { }
            }
            const target = { Position: new Position(1, 2) };
            const source = { Position: new Position(3, 4) };
            const result = deepMergeApiNamespaces(target, source);
            const pos = (result as any).Position as Position;
            assert.strictEqual(pos.line, 3);
            assert.strictEqual(pos.character, 4);
        });

        it('should not recurse into class instances when target has a plain object', () => {
            class Fancy { constructor(public x: number) { } }
            const target = { thing: { x: 1, y: 2 } };
            const source = { thing: new Fancy(10) };
            const result = deepMergeApiNamespaces(target, source);
            assert.ok((result as any).thing instanceof Fancy);
            assert.strictEqual((result as any).thing.x, 10);
        });

        it('should not recurse when target has a class instance and source has a plain object', () => {
            class Fancy { constructor(public x: number) { } }
            const target = { thing: new Fancy(10) };
            const source = { thing: { x: 1, y: 2 } };
            const result = deepMergeApiNamespaces(target, source);
            // Source is a plain object, target is a class instance — source wins (leaf override)
            assert.ok(!((result as any).thing instanceof Fancy));
            assert.deepStrictEqual((result as any).thing, { x: 1, y: 2 });
        });
    });

    describe('arrays are treated as leaves', () => {
        it('should not merge arrays — source wins', () => {
            const target = { items: [1, 2, 3] };
            const source = { items: [4, 5] };
            const result = deepMergeApiNamespaces(target, source);
            assert.deepStrictEqual((result as any).items, [4, 5]);
        });
    });

    describe('functions are treated as leaves', () => {
        it('should not recurse into functions with properties', () => {
            const fn1 = Object.assign(() => 1, { extra: 'a' });
            const fn2 = Object.assign(() => 2, { extra: 'b' });
            const target = { doStuff: fn1 };
            const source = { doStuff: fn2 };
            const result = deepMergeApiNamespaces(target, source);
            assert.strictEqual((result as any).doStuff, fn2);
            assert.strictEqual((result as any).doStuff(), 2);
        });
    });

    describe('realistic plugin API scenario', () => {
        it('should merge a legacy and terminal contribution like the assembler does', () => {
            let editorGetterCalled = false;
            let terminalGetterCalled = false;

            const legacy = {
                version: '1.0.0',
                commands: { registerCommand: () => { } },
                window: Object.defineProperty(
                    {
                        showInformationMessage: () => { },
                        showQuickPick: () => { },
                    },
                    'activeTextEditor',
                    {
                        get(): undefined { editorGetterCalled = true; return undefined; },
                        enumerable: true, configurable: true
                    }
                ),
                StatusBarAlignment: { Left: 1, Right: 2 },
            };

            const terminal = {
                window: Object.defineProperties(
                    {
                        createTerminal: () => { },
                        onDidCloseTerminal: () => { },
                    },
                    {
                        activeTerminal: {
                            get(): undefined { terminalGetterCalled = true; return undefined; },
                            enumerable: true, configurable: true
                        },
                        terminals: {
                            get(): never[] { return []; },
                            enumerable: true, configurable: true
                        }
                    }
                ),
                TerminalLocation: { Panel: 1, Editor: 2 },
            };

            const result = deepMergeApiNamespaces(legacy, terminal) as any;

            // Top-level properties from both
            assert.strictEqual(result.version, '1.0.0');
            assert.ok(result.commands);
            assert.deepStrictEqual(result.StatusBarAlignment, { Left: 1, Right: 2 });
            assert.deepStrictEqual(result.TerminalLocation, { Panel: 1, Editor: 2 });

            // window namespace is merged, not overwritten
            assert.ok(result.window.showInformationMessage);
            assert.ok(result.window.showQuickPick);
            assert.ok(result.window.createTerminal);
            assert.ok(result.window.onDidCloseTerminal);

            // Getters were not called during merge
            assert.strictEqual(editorGetterCalled, false);
            assert.strictEqual(terminalGetterCalled, false);

            // Getters still work
            result.window.activeTextEditor;
            assert.strictEqual(editorGetterCalled, true);
            result.window.activeTerminal;
            assert.strictEqual(terminalGetterCalled, true);
        });
    });
});

describe('DeepMerge type helper', () => {
    it('should produce correct types at compile time', () => {
        // This test is primarily a compile-time check.
        // If it compiles, the type helper works correctly.

        interface A { x: number; nested: { a: string } }
        interface B { y: boolean; nested: { b: number } }
        type Merged = DeepMerge<A, B>;

        // Verify the merged type has the expected shape by assigning a value
        const merged: Merged = { x: 1, y: true, nested: { a: 'hello', b: 42 } };
        assert.strictEqual(merged.x, 1);
        assert.strictEqual(merged.y, true);
        assert.strictEqual(merged.nested.a, 'hello');
        assert.strictEqual(merged.nested.b, 42);
    });

    it('should let source override non-object properties in the type', () => {
        interface A { value: string; other: number }
        interface B { value: number }
        type Merged = DeepMerge<A, B>;

        const merged: Merged = { value: 42, other: 1 };
        assert.strictEqual(merged.value, 42);
        assert.strictEqual(merged.other, 1);
    });
});
