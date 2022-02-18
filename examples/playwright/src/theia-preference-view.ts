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
import { TheiaApp } from './theia-app';
import { TheiaView } from './theia-view';

const TheiaSettingsViewData = {
    tabSelector: '#shell-tab-settings_widget',
    viewSelector: '#settings_widget'
};

export const PreferenceIds = {
    Explorer: {
        AutoReveal: 'explorer.autoReveal'
    },
    DiffEditor: {
        MaxComputationTime: 'diffEditor.maxComputationTime'
    }
};

export const DefaultPreferences = {
    Explorer: {
        AutoReveal: {
            Enabled: true
        }
    },
    DiffEditor: {
        MaxComputationTime: '5000'
    }
};

export enum TheiaPreferenceScope {
    User = 'User',
    Workspace = 'Workspace'
}

export class TheiaPreferenceView extends TheiaView {
    public customTimeout?: number;

    constructor(app: TheiaApp) {
        super(TheiaSettingsViewData, app);
    }

    override async open(preferenceScope = TheiaPreferenceScope.Workspace): Promise<TheiaView> {
        await this.app.quickCommandPalette.trigger('Preferences: Open Settings (UI)');
        await this.waitForVisible();
        await this.openPreferenceScope(preferenceScope);
        return this;
    }

    protected getScopeSelector(scope: TheiaPreferenceScope): string {
        return `li.preferences-scope-tab div.p-TabBar-tabLabel:has-text("${scope}")`;
    }

    async openPreferenceScope(scope: TheiaPreferenceScope): Promise<void> {
        await this.activate();
        const scopeTab = await this.page.waitForSelector(this.getScopeSelector(scope));
        await scopeTab.click();
    }

    async getBooleanPreferenceById(preferenceId: string): Promise<boolean> {
        const element = await this.findPreferenceEditorById(preferenceId);
        return element.isChecked();
    }

    async getBooleanPreferenceByPath(sectionTitle: string, name: string): Promise<boolean> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.getBooleanPreferenceById(preferenceId);
    }

    async setBooleanPreferenceById(preferenceId: string, value: boolean): Promise<void> {
        const element = await this.findPreferenceEditorById(preferenceId);
        return value ? element.check() : element.uncheck();
    }

    async setBooleanPreferenceByPath(sectionTitle: string, name: string, value: boolean): Promise<void> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.setBooleanPreferenceById(preferenceId, value);
    }

    async getStringPreferenceById(preferenceId: string): Promise<string> {
        const element = await this.findPreferenceEditorById(preferenceId);
        return element.evaluate(e => (e as HTMLInputElement).value);
    }

    async getStringPreferenceByPath(sectionTitle: string, name: string): Promise<string> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.getStringPreferenceById(preferenceId);
    }

    async setStringPreferenceById(preferenceId: string, value: string): Promise<void> {
        const element = await this.findPreferenceEditorById(preferenceId);
        return element.fill(value);
    }

    async setStringPreferenceByPath(sectionTitle: string, name: string, value: string): Promise<void> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.setStringPreferenceById(preferenceId, value);
    }

    async waitForModified(preferenceId: string): Promise<void> {
        await this.activate();
        const viewElement = await this.viewElement();
        await viewElement?.waitForSelector(`${this.getPreferenceGutterSelector(preferenceId)}.theia-mod-item-modified`, { timeout: this.customTimeout });
    }

    async resetStringPreferenceById(preferenceId: string): Promise<void> {
        const resetPreferenceButton = await this.findPreferenceResetButton(preferenceId);
        if (!resetPreferenceButton) {
            // preference not modified
            return;
        }
        const previousValue = await this.getStringPreferenceById(preferenceId);
        const selector = this.getPreferenceEditorSelector(preferenceId);
        const done = await resetPreferenceButton.click();
        await this.page.waitForFunction(data => {
            const element = document.querySelector(data.selector);
            if (!element) {
                throw new Error(`Could not find preference element with id "${data.preferenceId}"`);
            }
            const value = (element as HTMLInputElement).value;
            return value !== data.previousValue;
        }, { preferenceId, selector, previousValue, done }, { timeout: this.customTimeout });
    }

    async resetStringPreferenceByPath(sectionTitle: string, name: string): Promise<void> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.resetStringPreferenceById(preferenceId);
    }

    async resetBooleanPreferenceById(preferenceId: string): Promise<void> {
        const resetPreferenceButton = await this.findPreferenceResetButton(preferenceId);
        if (!resetPreferenceButton) {
            // preference not modified
            return;
        }
        const previousValue = await this.getBooleanPreferenceById(preferenceId);
        const selector = this.getPreferenceEditorSelector(preferenceId);
        const done = await resetPreferenceButton.click();
        await this.page.waitForFunction(data => {
            const element = document.querySelector(data.selector);
            if (!element) {
                throw new Error(`Could not find preference element with id "${data.preferenceId}"`);
            }
            const value = (element as HTMLInputElement).checked;
            return value !== data.previousValue;
        }, { preferenceId, selector, previousValue, done }, { timeout: this.customTimeout });
    }

    async resetBooleanPreferenceByPath(sectionTitle: string, name: string): Promise<void> {
        const preferenceId = await this.findPreferenceId(sectionTitle, name);
        return this.resetBooleanPreferenceById(preferenceId);
    }

    private async findPreferenceId(sectionTitle: string, name: string): Promise<string> {
        const viewElement = await this.viewElement();
        const sectionElement = await viewElement?.$(`xpath=//li[contains(@class, 'settings-section-title') and text() = '${sectionTitle}']/..`);

        const firstPreferenceAfterSection = await sectionElement?.$(`xpath=following-sibling::li[div/text() = '${name}'][1]`);
        const preferenceId = await firstPreferenceAfterSection?.getAttribute('data-pref-id');
        if (!preferenceId) {
            throw new Error(`Could not find preference id for "${sectionTitle}" > (...) > "${name}"`);
        }
        return preferenceId;
    }

    private async findPreferenceEditorById(preferenceId: string): Promise<ElementHandle<SVGElement | HTMLElement>> {
        const viewElement = await this.viewElement();
        const element = await viewElement?.waitForSelector(this.getPreferenceEditorSelector(preferenceId), { timeout: this.customTimeout });
        if (!element) {
            throw new Error(`Could not find element with preference id "${preferenceId}"`);
        }
        return element;
    }

    private getPreferenceSelector(preferenceId: string): string {
        return `li[data-pref-id="${preferenceId}"]`;
    }

    private getPreferenceEditorSelector(preferenceId: string): string {
        return `${this.getPreferenceSelector(preferenceId)} input`;
    }

    private getPreferenceGutterSelector(preferenceId: string): string {
        return `${this.getPreferenceSelector(preferenceId)} .pref-context-gutter`;
    }

    private async findPreferenceResetButton(preferenceId: string): Promise<ElementHandle<SVGElement | HTMLElement> | undefined> {
        await this.activate();
        const viewElement = await this.viewElement();
        const gutter = await viewElement?.waitForSelector(`${this.getPreferenceGutterSelector(preferenceId)}`, { timeout: this.customTimeout });
        if (!gutter) {
            throw new Error(`Could not determine modified state for element with preference id "${preferenceId}"`);
        }
        const isModified = await gutter.evaluate(e => e.classList.contains('theia-mod-item-modified'));
        if (!isModified) {
            return undefined;
        }

        const settingsContextMenuBtn = await viewElement?.waitForSelector(`${this.getPreferenceSelector(preferenceId)} .settings-context-menu-btn`);
        if (!settingsContextMenuBtn) {
            throw new Error(`Could not find context menu button for element with preference id "${preferenceId}"`);
        }
        await settingsContextMenuBtn.click();
        const resetPreferenceButton = await this.page.waitForSelector('li[data-command="preferences:reset"]');
        if (!resetPreferenceButton) {
            throw new Error(`Could not find menu entry to reset preference with id "${preferenceId}"`);
        }
        return resetPreferenceButton;
    }

}
