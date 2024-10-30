// *****************************************************************************
// Copyright (C) 2024 Toro Cloud Pty Ltd and others.
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
import * as React from 'react';
import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import { ReactDialog } from './react-dialog';

class MyDialog extends ReactDialog<void> {
    constructor() {
        super({ title: '' });
    }

    override get value(): void {
        return;
    }

    protected override render(): React.ReactNode {
        return <></>;
    }
}

describe('ReactDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should be extended', () => {
        const dialog = new MyDialog();
        assert.equal(dialog instanceof ReactDialog, true);
    });
});
