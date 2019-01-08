/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { Theme } from './theming';
import { SharedStyle } from './shared-style';

export interface BrandingTheme {

    /**
     * The main icon for the application.
     */
    mainIcon: (theme: Theme) => string,

    /**
     * The menu icon for the application.
     */
    menuIcon: (theme: Theme) => string,

    /**
     * The main icon size.
     */
    mainSize: string;
}

export class BrandingService {

    protected style: SharedStyle;

    protected readonly GETTING_STARTED_SELECTOR = '#getting-started-logo';
    protected readonly MAIN_SELECTOR = '#theia-main-content-panel';
    protected readonly MENU_SELECTOR = '.theia-icon';

    protected brandingTheme: BrandingTheme;

    protected constructor() {
        this.style = new SharedStyle();
    }

    static readonly instance = new BrandingService();
    static get(): BrandingService {
        return this.instance;
    }

    /**
     * Set the branding properties for the application.
     *
     * @param brandingTheme the `BrandingTheme`.
     */
    setBranding(brandingTheme: BrandingTheme): void {
        this.brandingTheme = brandingTheme;
        this.updateBranding();
    }

    /**
     * Update branding for main, and menu icons.
     */
    private updateBranding(): void {
        this.setMainIcon();
        this.setMenuIcon();
    }

    /**
     * Set the main icon style.
     */
    private setMainIcon(): void {
        this.style.insertRule(this.MAIN_SELECTOR, theme =>
            `
            background-image: url("${this.brandingTheme.mainIcon(theme)}");
            background-position: center center;
            background-repeat: no-repeat;
            background-size: ${this.brandingTheme.mainSize};
            `
        );
    }

    /**
     * Set the menu icon style.
     */
    private setMenuIcon(): void {
        this.style.insertRule(this.MENU_SELECTOR, theme =>
            `
            background-image: url("${this.brandingTheme.menuIcon(theme)}");
            background-repeat: no-repeat;
            background-position: center;
            background-size: contain;
            `
        );
    }

}
