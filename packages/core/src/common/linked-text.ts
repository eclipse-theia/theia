// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copied from VS Code 1.134.0:
// https://github.com/microsoft/vscode/blob/1.134.0/src/vs/base/common/linkedText.ts#L8-L55

export interface ILink {
    readonly label: string;
    readonly href: string;
    readonly title?: string;
}

export type LinkedTextNode = string | ILink;

export class LinkedText {
    constructor(readonly nodes: LinkedTextNode[]) { }

    toString(): string {
        return this.nodes.map(node => typeof node === 'string' ? node : node.label).join('');
    }
}

const LINK_REGEX = /\[([^\]]+)\]\(((?:https?:\/\/|command:|file:)[^\)\s]+)(?: (["'])(.+?)(\3))?\)/gi;

export function parseLinkedText(text: string): LinkedText {
    const result: LinkedTextNode[] = [];

    let index = 0;
    let match: RegExpExecArray | null;

    while (match = LINK_REGEX.exec(text)) {
        if (match.index - index > 0) {
            result.push(text.substring(index, match.index));
        }

        const [, label, href, , title] = match;

        if (title) {
            result.push({ label, href, title });
        } else {
            result.push({ label, href });
        }

        index = match.index + match[0].length;
    }

    if (index < text.length) {
        result.push(text.substring(index));
    }

    return new LinkedText(result);
}
