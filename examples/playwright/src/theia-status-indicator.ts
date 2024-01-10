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

import { ElementHandle } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';

export abstract class TheiaStatusIndicator extends TheiaPageObject {
    protected abstract id: string;

    protected statusBarElementSelector = '#theia-statusBar div.element';

    protected getSelectorForId(id: string): string {
        return `${this.statusBarElementSelector}#status-bar-${id}`;
    }

    async waitForVisible(waitForDetached = false): Promise<void> {
        await this.page.waitForSelector(this.getSelectorForId(this.id), waitForDetached ? { state: 'detached' } : {});
    }

    async getElementHandle(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        const element = await this.page.$(this.getSelectorForId(this.id));
        if (element) {
            return element;
        }
        throw new Error('Could not find status bar element with ID ' + this.id);
    }

    async isVisible(): Promise<boolean> {
        try {
            const element = await this.getElementHandle();
            return element.isVisible();
        } catch (err) {
            return false;
        }
    }

}
