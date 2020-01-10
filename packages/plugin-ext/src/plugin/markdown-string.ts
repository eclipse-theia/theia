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

import { MarkdownString as IMarkdownString } from '../common/plugin-api-rpc-model';

export class MarkdownString {

    value: string;
    isTrusted?: boolean;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendText(value: string): MarkdownString {
        // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
        this.value += value.replace(/[\\`*_{}[\]()#+\-.!]/g, '\\$&');
        return this;
    }

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }

    appendCodeblock(code: string, language: string = ''): MarkdownString {
        this.value += '\n```';
        this.value += language;
        this.value += '\n';
        this.value += code;
        this.value += '\n```\n';
        return this;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMarkdownString(thing: any): thing is IMarkdownString {
    if (thing instanceof MarkdownString) {
        return true;
    } else if (thing && typeof thing === 'object') {
        return typeof (<MarkdownString>thing).value === 'string'
            && (typeof (<MarkdownString>thing).isTrusted === 'boolean' || (<MarkdownString>thing).isTrusted === undefined);
    }
    return false;
}
