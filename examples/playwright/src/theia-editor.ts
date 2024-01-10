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
import { TheiaView } from './theia-view';
import { containsClass } from './util';

export abstract class TheiaEditor extends TheiaView {

    async isDirty(): Promise<boolean> {
        return await this.isTabVisible() && containsClass(this.tabElement(), 'theia-mod-dirty');
    }

    async save(): Promise<void> {
        await this.activate();
        if (!await this.isDirty()) {
            return;
        }
        const fileMenu = await this.app.menuBar.openMenu('File');
        const saveItem = await fileMenu.menuItemByName('Save');
        await saveItem?.click();
        await this.page.waitForSelector(this.tabSelector + '.theia-mod-dirty', { state: 'detached' });
    }

    async closeWithoutSave(): Promise<void> {
        if (!await this.isDirty()) {
            return super.close(true);
        }
        await super.close(false);
        const saveDialog = new TheiaDialog(this.app);
        await saveDialog.clickButton('Don\'t save');
        await super.waitUntilClosed();
    }

    async saveAndClose(): Promise<void> {
        await this.save();
        await this.close();
    }

    async undo(times = 1): Promise<void> {
        await this.activate();
        for (let i = 0; i < times; i++) {
            const editMenu = await this.app.menuBar.openMenu('Edit');
            const undoItem = await editMenu.menuItemByName('Undo');
            await undoItem?.click();
            await this.app.page.waitForTimeout(200);
        }
    }

    async redo(times = 1): Promise<void> {
        await this.activate();
        for (let i = 0; i < times; i++) {
            const editMenu = await this.app.menuBar.openMenu('Edit');
            const undoItem = await editMenu.menuItemByName('Redo');
            await undoItem?.click();
            await this.app.page.waitForTimeout(200);
        }
    }

}
