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

export class TheiaDialog extends TheiaPageObject {

    protected overlaySelector = '#theia-dialog-shell';
    protected blockSelector = this.overlaySelector + ' .dialogBlock';
    protected titleBarSelector = this.blockSelector + ' .dialogTitle';
    protected titleSelector = this.titleBarSelector + ' > div';
    protected contentSelector = this.blockSelector + ' .dialogContent > div';
    protected controlSelector = this.blockSelector + ' .dialogControl';
    protected errorSelector = this.blockSelector + ' .dialogContent';

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(`${this.blockSelector}`, { state: 'visible' });
    }

    async waitForClosed(): Promise<void> {
        await this.page.waitForSelector(`${this.blockSelector}`, { state: 'detached' });
    }

    async isVisible(): Promise<boolean> {
        const pouDialogElement = await this.page.$(this.blockSelector);
        return pouDialogElement ? pouDialogElement.isVisible() : false;
    }

    async title(): Promise<string | null> {
        const titleElement = await this.page.waitForSelector(`${this.titleSelector}`);
        return titleElement.textContent();
    }

    async waitUntilTitleIsDisplayed(title: string): Promise<void> {
        await this.page.waitForFunction(predicate => {
            const element = document.querySelector(predicate.titleSelector);
            return !!element && element.textContent === predicate.expectedTitle;
        }, { titleSelector: this.titleSelector, expectedTitle: title });
    }

    protected async contentElement(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(this.contentSelector);
    }

    protected async buttonElement(label: string): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(`${this.controlSelector} button:has-text("${label}")`);
    }

    protected async buttonElementByClass(buttonClass: string): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(`${this.controlSelector} button${buttonClass}`);
    }

    protected async validationElement(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(`${this.errorSelector} div.error`, { state: 'attached' });
    }

    async getValidationText(): Promise<string | null> {
        const element = await this.validationElement();
        return element.textContent();
    }

    async validationResult(): Promise<boolean> {
        const validationText = await this.getValidationText();
        return validationText !== '' ? false : true;
    }

    async close(): Promise<void> {
        const closeButton = await this.page.waitForSelector(`${this.titleBarSelector} i.closeButton`);
        await closeButton.click();
        await this.waitForClosed();
    }

    async clickButton(buttonLabel: string): Promise<void> {
        const buttonElement = await this.buttonElement(buttonLabel);
        await buttonElement.click();
    }

    async isButtonDisabled(buttonLabel: string): Promise<boolean> {
        const buttonElement = await this.buttonElement(buttonLabel);
        return buttonElement.isDisabled();
    }

    async clickMainButton(): Promise<void> {
        const buttonElement = await this.buttonElementByClass('.theia-button.main');
        await buttonElement.click();
    }

    async clickSecondaryButton(): Promise<void> {
        const buttonElement = await this.buttonElementByClass('.theia-button.secondary');
        await buttonElement.click();
    }

    async waitUntilMainButtonIsEnabled(): Promise<void> {
        await this.page.waitForFunction(predicate => {
            const button = document.querySelector<HTMLButtonElement>(predicate.buttonSelector);
            return !!button && !button.disabled;
        }, { buttonSelector: `${this.controlSelector} > button.theia-button.main` });
    }

}
