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
import { listByKeywords } from './keyword-list';

describe('listByKeywords', () => {
    const entries = [
        { name: 'pdf', description: 'Extract text\nand tables from PDF files.' },
        { name: 'coding-workflow', description: 'Carry out a code change: refactor, bug fix.' },
        { name: 'ext:ponytail', description: 'Minimal code, including refactor.' }
    ];

    it('lists every entry in order, descriptions on one line, without a query', () => {
        const expected = '- pdf: Extract text and tables from PDF files.\n' +
            '- coding-workflow: Carry out a code change: refactor, bug fix.\n' +
            '- ext:ponytail: Minimal code, including refactor.';
        expect(listByKeywords(entries)).to.equal(expected);
        expect(listByKeywords(entries, '  ')).to.equal(expected);
    });

    it('keeps entries matching any keyword, case-insensitively, most matches first', () => {
        expect(listByKeywords(entries, 'Refactor BUG')).to.equal(
            '- coding-workflow: Carry out a code change: refactor, bug fix.\n' +
            '- ext:ponytail: Minimal code, including refactor.');
    });

    it('matches against the name', () => {
        expect(listByKeywords(entries, 'ext:')).to.equal('- ext:ponytail: Minimal code, including refactor.');
    });

    it('returns undefined when nothing matches or there are no entries', () => {
        expect(listByKeywords(entries, 'calendar')).to.equal(undefined);
        expect(listByKeywords([])).to.equal(undefined);
    });
});
