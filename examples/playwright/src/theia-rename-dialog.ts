// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
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

import { TheiaDialog } from './theia-dialog';
import { USER_KEY_TYPING_DELAY } from './util';

export class TheiaRenameDialog extends TheiaDialog {

    async enterNewName(newName: string): Promise<void> {
        const inputField = this.page.locator(`${this.blockSelector} .theia-input`);
        await inputField.selectText();
        await inputField.pressSequentially(newName, { delay: USER_KEY_TYPING_DELAY });
    }

    async confirm(): Promise<void> {
        if (!await this.validationResult()) {
            throw new Error(`Unexpected validation error in TheiaRenameDialog: '${await this.getValidationText()}`);
        }
        await this.clickMainButton();
    }

}
