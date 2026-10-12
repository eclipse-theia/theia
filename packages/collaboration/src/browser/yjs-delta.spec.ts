// *****************************************************************************
// Copyright (C) 2026 Sahil Gupta and others.
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
import { yTextDeltaToEdits } from './yjs-delta';

describe('yTextDeltaToEdits', () => {

    it('returns no edits for a pure retain', () => {
        expect(yTextDeltaToEdits([{ retain: 10 }])).to.deep.equal([]);
    });

    it('places an insert at the retained offset without advancing the pre-edit cursor', () => {
        // retain 5, insert 'abc', delete 2: the delete must still address old offsets [5, 7).
        expect(yTextDeltaToEdits([{ retain: 5 }, { insert: 'abc' }, { delete: 2 }])).to.deep.equal([
            { start: 5, end: 5, text: 'abc' },
            { start: 5, end: 7, text: '' }
        ]);
    });

    it('advances past a delete so a following insert stays aligned to the old document', () => {
        // delete 3 then insert 'x': the insert lands at old offset 3, not 0.
        expect(yTextDeltaToEdits([{ delete: 3 }, { insert: 'x' }])).to.deep.equal([
            { start: 0, end: 3, text: '' },
            { start: 3, end: 3, text: 'x' }
        ]);
    });

    it('keeps multiple changes aligned across retains, inserts and deletes', () => {
        // cursor over the old document: 0 ->2 (retain) ->3 (delete 1) ->6 (retain 3) ->6 (insert) ->8 (delete 2)
        expect(yTextDeltaToEdits([
            { retain: 2 }, { delete: 1 }, { retain: 3 }, { insert: 'zz' }, { delete: 2 }
        ])).to.deep.equal([
            { start: 2, end: 3, text: '' },
            { start: 6, end: 6, text: 'zz' },
            { start: 6, end: 8, text: '' }
        ]);
    });

    it('skips non-string (embed) inserts', () => {
        expect(yTextDeltaToEdits([{ retain: 1 }, { insert: { embed: true } }, { retain: 1 }])).to.deep.equal([]);
    });

});
