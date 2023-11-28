// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import * as theia from '@theia/plugin';
import { SerializedAutoClosingPair, SerializedIndentationRule, SerializedOnEnterRule, SerializedRegExp } from '../common';
import { SyntaxTokenType } from './types-impl';

export function serializeEnterRules(rules?: theia.OnEnterRule[]): SerializedOnEnterRule[] | undefined {
    if (typeof rules === 'undefined' || rules === null) {
        return undefined;
    }

    return rules.map(r =>
    ({
        beforeText: serializeRegExp(r.beforeText),
        afterText: serializeRegExp(r.afterText),
        previousLineText: serializeRegExp(r.previousLineText),
        action: r.action,
    } as SerializedOnEnterRule));
}

export function serializeRegExp(regexp?: RegExp): SerializedRegExp | undefined {
    if (typeof regexp === 'undefined' || regexp === null) {
        return undefined;
    }

    return {
        pattern: regexp.source,
        flags: (regexp.global ? 'g' : '') + (regexp.ignoreCase ? 'i' : '') + (regexp.multiline ? 'm' : '')
    };
}

export function serializeIndentation(indentationRules?: theia.IndentationRule): SerializedIndentationRule | undefined {
    if (typeof indentationRules === 'undefined' || indentationRules === null) {
        return undefined;
    }

    return {
        increaseIndentPattern: serializeRegExp(indentationRules.increaseIndentPattern),
        decreaseIndentPattern: serializeRegExp(indentationRules.decreaseIndentPattern),
        indentNextLinePattern: serializeRegExp(indentationRules.indentNextLinePattern),
        unIndentedLinePattern: serializeRegExp(indentationRules.unIndentedLinePattern)
    };
}

export function serializeAutoClosingPairs(pairs: theia.AutoClosingPair[] | undefined): SerializedAutoClosingPair[] | undefined {
    if (!pairs) {
        return undefined;
    };
    return pairs.map(pair => ({
        open: pair.open,
        close: pair.close,
        notIn: pair.notIn ? pair.notIn.map(tokenType => SyntaxTokenType.toString(tokenType)) : undefined
    }));
}
