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

import { expect } from 'chai';
import { parseLinkedText } from './linked-text';

describe('parseLinkedText', () => {
    it('parses the VS Code walkthrough link schemes and preserves surrounding text', () => {
        const linkedText = parseLinkedText('Use [Run](command:sample.run) or [open](https://example.test).');
        expect(linkedText.nodes).to.deep.equal([
            'Use ',
            { label: 'Run', href: 'command:sample.run' },
            ' or ',
            { label: 'open', href: 'https://example.test' },
            '.'
        ]);
    });

    it('preserves an optional link title', () => {
        expect(parseLinkedText('[Open](file:///tmp/example "Open file")').nodes).to.deep.equal([
            { label: 'Open', href: 'file:///tmp/example', title: 'Open file' }
        ]);
    });
});
