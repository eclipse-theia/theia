/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

/**
 * Set of Right Panel Functions for Testing Purposes
 */
export class RightPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    /**
     * Determine if the given tab exists.
     *
     * @param name the tab name.
     * @returns `true` if the given tab exists.
     */
    tabExists(name: string): boolean {
        return this.driver.element('.p-TabBar.theia-app-right .p-TabBar-content').isExisting(`div=${name}`);
    }

    /**
     * Determine if the output view is visible.
     *
     * @returns `true` if the output view is visible.
     */
    isOutlineViewVisible(): boolean {
        return (this.isPanelVisible() && this.driver.isExisting('#outline-view'));
    }

    /**
     * Wait for the output view to be visible.
     */
    waitForOutlineView(): void {
        this.driver.waitForVisible('#outline-view', 3000);
    }

    /**
     * Determine if the right side panel is visible.
     *
     * @returns `true` if the right side panel is visible.
     */
    protected isPanelVisible(): boolean {
        return (this.driver.element('#theia-right-side-panel').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1);
    }
}
