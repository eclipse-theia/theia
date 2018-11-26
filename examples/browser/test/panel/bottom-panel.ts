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
 * Set of Bottom Panel Functions for Testing Purposes
 */
export class BottomPanel {

    constructor(protected readonly driver: WebdriverIO.Client<void>) { }

    /**
     * Determine if the given tab exists.
     *
     * @param name the tab name.
     * @returns `true` if the given tab exists.
     */
    tabExists(name: string): boolean {
        return this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').isExisting(`div=${name}`);
    }

    /**
     * Determine if the given tab is active.
     *
     * @param name the tab name.
     * @returns `true` if the given tab is active.
     */
    isTabActive(name: string): boolean {
        const tab = this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').element(`div=${name}`);
        /* Check if the parent li container has the p-mod-current class which makes it active*/
        return (tab.$('..').getAttribute('class').split(' ').indexOf('p-mod-current') > -1);
    }

    /**
     * Open the given tab.
     *
     * @param name the tab name.
     */
    openTab(name: string): void {
        this.driver.element('#theia-bottom-content-panel .p-TabBar .p-TabBar-content').click(`div=${name}`);
    }

    /**
     * Determine if the terminal view exists.
     *
     * @returns `true` if the terminal view exists.
     */
    terminalExists(): boolean {
        return this.driver.isExisting('.p-Widget div.terminal.xterm');
    }

    /**
     * Wait for the terminal view to exist.
     */
    waitForTerminalView(): void {
        this.driver.waitForExist('.p-Widget div.terminal.xterm', 3000);
    }

    /**
     * Determine if the problems view exists.
     *
     * @returns `true` if problems view exists.
     */
    problemsViewExists(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-marker-container');
    }

    /**
     * Wait for the problems view to exist.
     */
    waitForProblemsView(): void {
        this.driver.waitForExist('.p-Widget div.theia-marker-container', 3000);
    }

    /**
     * Determine if the call hierarchy view exists.
     *
     * @returns `true` if the call hierarchy view exists.
     */
    callHierarchyExists(): boolean {
        return this.driver.isExisting('#callhierarchy');
    }

    /**
     * Wait for the call hierarchy view to exist.
     */
    waitForCallHierarchyView(): void {
        this.driver.waitForExist('#callhierarchy', 3000);
    }

    /**
     * Determine if the output view exists.
     *
     * @returns `true` if the output view exists.
     */
    outputViewExists(): boolean {
        return this.driver.isExisting('.p-Widget div.theia-output');
    }

    /**
     * Wait for the output view to exist.
     */
    waitForOutputView(): void {
        this.driver.waitForExist('.p-Widget div.theia-output', 3000);
    }

    /**
     * Determine if the debug console exists.
     *
     * @returns `true` if the debug console exists.
     */
    debugConsoleExists(): boolean {
        return this.driver.isExisting('#debug-console');
    }

    /**
     * Wait for the debug console to exist.
     */
    waitForDebugConsoleView(): void {
        this.driver.waitForExist('#debug-console', 3000);
    }

    /**
     * Close the current view.
     */
    closeCurrentView(): void {
        this.driver.click('#theia-bottom-content-panel .p-TabBar-tab.p-mod-current .p-TabBar-tabCloseIcon');
    }

}
