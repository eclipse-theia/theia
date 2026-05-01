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
import { MarkdownStringImpl } from './markdown-string';

describe('MarkdownStringImpl#appendCodeblock', () => {

    it('uses a triple-backtick fence for code without backticks', () => {
        const md = new MarkdownStringImpl();
        md.appendCodeblock('json', '{ "type": "adaptive" }');
        expect(md.value).to.equal('\n```json\n{ "type": "adaptive" }\n```\n');
    });

    it('uses a longer fence when the code contains a triple-backtick run', () => {
        const md = new MarkdownStringImpl();
        const code = 'before\n```json\n{ "x": 1 }\n```\nafter';
        md.appendCodeblock('', code);
        // The fence must be at least 4 backticks so the inner ``` cannot close it.
        expect(md.value).to.equal('\n````\n' + code + '\n````\n');
    });

    it('grows the fence to be longer than the longest backtick run inside the code', () => {
        const md = new MarkdownStringImpl();
        const code = 'a ```` b ``` c';
        md.appendCodeblock('', code);
        // Longest run is 4, so fence must be 5.
        expect(md.value).to.equal('\n`````\n' + code + '\n`````\n');
    });

    it('still uses a triple-backtick fence when only single/double backticks appear', () => {
        const md = new MarkdownStringImpl();
        const code = 'inline `code` and ``double`` only';
        md.appendCodeblock('', code);
        expect(md.value).to.equal('\n```\n' + code + '\n```\n');
    });
});
