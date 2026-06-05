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
import { isValidTodoItem } from '../common/todo-tool';

describe('isValidTodoItem', () => {
    it('should accept a minimal valid item', () => {
        expect(isValidTodoItem({ content: 'Do something', activeForm: 'Doing something', status: 'pending' })).to.be.true;
    });

    it('should accept all valid statuses', () => {
        expect(isValidTodoItem({ content: 'X', activeForm: 'Xing', status: 'pending' })).to.be.true;
        expect(isValidTodoItem({ content: 'X', activeForm: 'Xing', status: 'in_progress' })).to.be.true;
        expect(isValidTodoItem({ content: 'X', activeForm: 'Xing', status: 'completed' })).to.be.true;
    });

    it('should reject non-object values', () => {
        expect(isValidTodoItem(undefined)).to.be.false;
        expect(isValidTodoItem('string')).to.be.false;
        expect(isValidTodoItem(42)).to.be.false;
    });

    it('should reject items with missing required fields', () => {
        expect(isValidTodoItem({ status: 'pending' })).to.be.false;
        expect(isValidTodoItem({ content: 'X' })).to.be.false;
        expect(isValidTodoItem({ content: 'X', status: 'pending' })).to.be.false;
        expect(isValidTodoItem({ content: 'X', activeForm: 'Xing' })).to.be.false;
    });

    it('should reject items with invalid status', () => {
        expect(isValidTodoItem({ content: 'X', activeForm: 'Xing', status: 'unknown' })).to.be.false;
    });

});

