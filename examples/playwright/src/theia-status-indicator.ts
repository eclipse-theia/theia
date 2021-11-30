/********************************************************************************
 * Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { ElementHandle } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';

export class TheiaStatusIndicator extends TheiaPageObject {

    protected elementSpanSelector = '#theia-statusBar .element span';

    protected async getElementHandle(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        return this.page.$(this.elementSpanSelector);
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(this.elementSpanSelector);
    }

    protected getSelectorByTitle(title: string): string {
        return `.element[title="${title}"]`;
    }

    async getElementHandleByTitle(title: string): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        // Fetch element via title in case status elements exist without a dedicated Codicon icon
        return this.page.$(this.getSelectorByTitle(title));
    }

    protected getSelectorByIcon(icon: string): string {
        return `${this.elementSpanSelector}.codicon.${icon}`;
    }

    async getElementHandleByIcon(iconClass: string | string[], titleContain = ''): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        const icons = Array.isArray(iconClass) ? iconClass : [iconClass];
        for (const icon of icons) {
            const span = await this.page.$(this.getSelectorByIcon(icon));
            if (span) {
                const parent = await span.$('..');
                if (titleContain === '') {
                    return parent;
                } else {
                    const parentTitle = await parent?.getAttribute('title');
                    if (parentTitle?.includes(titleContain)) { return parent; }
                }
            }
        }
        throw new Error('Cannot find indicator');
    }

    async waitForVisibleByTitle(title: string, waitForDetached = false): Promise<void> {
        await this.page.waitForSelector(this.getSelectorByTitle(title), waitForDetached ? { state: 'detached' } : {});
    }

    async waitForVisibleByIcon(icon: string, waitForDetached = false): Promise<void> {
        await this.page.waitForSelector(this.getSelectorByIcon(icon), waitForDetached ? { state: 'detached' } : {});
    }

    async isVisible(icon: string | string[], titleContain = ''): Promise<boolean> {
        try {
            const element = await this.getElementHandleByIcon(icon, titleContain);
            return !!element && element.isVisible();
        } catch (err) {
            return false;
        }
    }

}
