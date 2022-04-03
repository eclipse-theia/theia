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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle } from '@playwright/test';

import { TheiaApp } from './theia-app';
import { TheiaContextMenu } from './theia-context-menu';
import { TheiaMenu } from './theia-menu';

export class TheiaTreeNode {

    labelElementCssClass = '.theia-TreeNodeSegmentGrow';
    expansionToggleCssClass = '.theia-ExpansionToggle';
    collapsedCssClass = '.theia-mod-collapsed';

    constructor(protected elementHandle: ElementHandle<SVGElement | HTMLElement>, protected app: TheiaApp) { }

    async label(): Promise<string | null> {
        const labelNode = await this.elementHandle.$(this.labelElementCssClass);
        if (!labelNode) {
            throw new Error('Cannot read label of ' + this.elementHandle);
        }
        return labelNode.textContent();
    }

    async isCollapsed(): Promise<boolean> {
        return !! await this.elementHandle.$(this.collapsedCssClass);
    }

    async isExpandable(): Promise<boolean> {
        return !! await this.elementHandle.$(this.expansionToggleCssClass);
    }

    async expand(): Promise<void> {
        if (! await this.isCollapsed()) {
            return;
        }
        const expansionToggle = await this.elementHandle.waitForSelector(this.expansionToggleCssClass);
        await expansionToggle.click();
        await this.elementHandle.waitForSelector(`${this.expansionToggleCssClass}:not(${this.collapsedCssClass})`);
    }

    async openContextMenu(): Promise<TheiaMenu> {
        return TheiaContextMenu.open(this.app, () => this.elementHandle.waitForSelector(this.labelElementCssClass));
    }

}
