/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

// adjusted to Theia APIs

import 'mocha';
import * as assert from 'assert';
import { ContextKeyExpr } from './context-key';

// tslint:disable:no-any
function createContext(ctx: any) {
    return {
        getValue: (key: string) => ctx[key]
    };
}

describe('ContextKeyExpr', () => {
    it('ContextKeyExpr.equals', () => {
        const a = ContextKeyExpr.and(
            ContextKeyExpr.has('a1'),
            ContextKeyExpr.and(ContextKeyExpr.has('and.a')),
            ContextKeyExpr.has('a2'),
            ContextKeyExpr.regex('d3', /d.*/),
            ContextKeyExpr.regex('d4', /\*\*3*/),
            ContextKeyExpr.equals('b1', 'bb1'),
            ContextKeyExpr.equals('b2', 'bb2'),
            ContextKeyExpr.notEquals('c1', 'cc1'),
            ContextKeyExpr.notEquals('c2', 'cc2'),
            ContextKeyExpr.not('d1'),
            ContextKeyExpr.not('d2')
        );
        const b = ContextKeyExpr.and(
            ContextKeyExpr.equals('b2', 'bb2'),
            ContextKeyExpr.notEquals('c1', 'cc1'),
            ContextKeyExpr.not('d1'),
            ContextKeyExpr.regex('d4', /\*\*3*/),
            ContextKeyExpr.notEquals('c2', 'cc2'),
            ContextKeyExpr.has('a2'),
            ContextKeyExpr.equals('b1', 'bb1'),
            ContextKeyExpr.regex('d3', /d.*/),
            ContextKeyExpr.has('a1'),
            ContextKeyExpr.and(ContextKeyExpr.equals('and.a', true)),
            ContextKeyExpr.not('d2')
        );
        assert(a.equals(b), 'expressions should be equal');
    });

    it('normalize', () => {
        const key1IsTrue = ContextKeyExpr.equals('key1', true);
        const key1IsNotFalse = ContextKeyExpr.notEquals('key1', false);
        const key1IsFalse = ContextKeyExpr.equals('key1', false);
        const key1IsNotTrue = ContextKeyExpr.notEquals('key1', true);

        assert.ok(key1IsTrue.normalize()!.equals(ContextKeyExpr.has('key1')));
        assert.ok(key1IsNotFalse.normalize()!.equals(ContextKeyExpr.has('key1')));
        assert.ok(key1IsFalse.normalize()!.equals(ContextKeyExpr.not('key1')));
        assert.ok(key1IsNotTrue.normalize()!.equals(ContextKeyExpr.not('key1')));
    });

    it('evaluate', () => {
        /* tslint:disable:triple-equals */
        const context = createContext({
            'a': true,
            'b': false,
            'c': '5',
            'd': 'd'
        });
        function testExpression(expr: string, expected: boolean): void {
            const rules = ContextKeyExpr.deserialize(expr);
            assert.equal(rules!.evaluate(context), expected, expr);
        }
        function testBatch(expr: string, value: any): void {
            testExpression(expr, !!value);
            testExpression(expr + ' == true', !!value);
            testExpression(expr + ' != true', !value);
            testExpression(expr + ' == false', !value);
            testExpression(expr + ' != false', !!value);
            testExpression(expr + ' == 5', value == <any>'5');
            testExpression(expr + ' != 5', value != <any>'5');
            testExpression('!' + expr, !value);
            testExpression(expr + ' =~ /d.*/', /d.*/.test(value));
            testExpression(expr + ' =~ /D/i', /D/i.test(value));
        }

        testBatch('a', true);
        testBatch('b', false);
        testBatch('c', '5');
        testBatch('d', 'd');
        testBatch('z', undefined);

        testExpression('a && !b', true && !false);
        testExpression('a && b', true && false);
        testExpression('a && !b && c == 5', true && !false && '5' == '5');
        testExpression('d =~ /e.*/', false);
        /* tslint:enable:triple-equals */
    });
});
