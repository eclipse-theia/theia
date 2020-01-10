/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { Emitter, Event } from '../../common/event';
import { injectable } from 'inversify';
import { QuickTitleButton, QuickTitleButtonSide } from '../../common/quick-open-model';

@injectable()
export class QuickTitleBar {

    private readonly onDidTriggerButtonEmitter: Emitter<QuickTitleButton>;
    private _isAttached: boolean;

    private titleElement: HTMLElement;
    private titleBarContainer: HTMLElement;
    private attachedNode: HTMLElement | undefined;

    private _title: string | undefined;
    private _step: number | undefined;
    private _totalSteps: number | undefined;
    private _buttons: ReadonlyArray<QuickTitleButton>;

    private tabIndex = 2; // Keep track of the tabIndex for the buttons

    constructor() {
        this.titleElement = document.createElement('div');
        this.titleElement.className = QuickTitleBar.Styles.QUICK_TITLE_HEADER;

        this.onDidTriggerButtonEmitter = new Emitter();
    }

    get onDidTriggerButton(): Event<QuickTitleButton> {
        return this.onDidTriggerButtonEmitter.event;
    }

    get isAttached(): boolean {
        return this._isAttached;
    }

    set isAttached(isAttached: boolean) {
        this._isAttached = isAttached;
    }

    set title(title: string | undefined) {
        this._title = title;
        this.updateInnerTitleText();
    }

    get title(): string | undefined {
        return this._title;
    }

    set step(step: number | undefined) {
        this._step = step;
        this.updateInnerTitleText();
    }

    get step(): number | undefined {
        return this._step;
    }

    set totalSteps(totalSteps: number | undefined) {
        this._totalSteps = totalSteps;
        this.updateInnerTitleText();
    }

    get totalSteps(): number | undefined {
        return this._totalSteps;
    }

    set buttons(buttons: ReadonlyArray<QuickTitleButton> | undefined) {
        if (buttons === undefined) {
            this._buttons = [];
            return;
        }

        this._buttons = buttons;
    }

    get buttons(): ReadonlyArray<QuickTitleButton> | undefined {
        return this._buttons;
    }

    private updateInnerTitleText(): void {
        let innerTitle = '';

        if (this.title) {
            innerTitle = this.title + ' ';
        }

        if (this.step && this.totalSteps) {
            innerTitle += `(${this.step}/${this.totalSteps})`;
        } else if (this.step) {
            innerTitle += this.step;
        }

        this.titleElement.innerText = innerTitle;
    }

    // Left buttons are for the buttons dervied from QuickInputButtons
    private getLeftButtons(): ReadonlyArray<QuickTitleButton> {
        if (this._buttons === undefined || this._buttons.length === 0) {
            return [];
        }
        return this._buttons.filter(btn => btn.side === QuickTitleButtonSide.LEFT);
    }

    private getRightButtons(): ReadonlyArray<QuickTitleButton> {
        if (this._buttons === undefined || this._buttons.length === 0) {
            return [];
        }
        return this._buttons.filter(btn => btn.side === QuickTitleButtonSide.RIGHT);
    }

    private createButtonElements(buttons: ReadonlyArray<QuickTitleButton>): HTMLSpanElement[] {
        return buttons.map(btn => {
            const spanElement = document.createElement('span');
            spanElement.className = QuickTitleBar.Styles.QUICK_TITLE_BUTTON;
            spanElement.tabIndex = 0;
            if (btn.iconClass) {
                spanElement.classList.add(...btn.iconClass.split(' '));
            }

            if (btn.icon !== '') {
                spanElement.style.backgroundImage = `url(\'${btn.icon}\')`;
            }

            spanElement.classList.add('icon');
            spanElement.tabIndex = this.tabIndex;
            spanElement.title = btn.tooltip ? btn.tooltip : '';
            spanElement.onclick = () => {
                this.onDidTriggerButtonEmitter.fire(btn);
            };
            spanElement.onkeyup = event => {
                if (event.code === 'Enter') {
                    spanElement.click();
                }
            };
            this.tabIndex += 1;
            return spanElement;
        });
    }

    private createTitleBarDiv(): HTMLDivElement {
        const div = document.createElement('div');
        div.className = QuickTitleBar.Styles.QUICK_TITLE_CONTAINER;
        div.onclick = event => {
            event.stopPropagation();
            event.preventDefault();
        };
        return div;
    }

    private createLeftButtonDiv(): HTMLDivElement {
        const leftButtonDiv = document.createElement('div'); // Holds all the buttons that get added to the left
        leftButtonDiv.className = QuickTitleBar.Styles.QUICK_TITLE_LEFT_BAR;

        this.createButtonElements(this.getLeftButtons()).forEach(btn => leftButtonDiv.appendChild(btn));
        return leftButtonDiv;
    }

    private createRightButtonDiv(): HTMLDivElement {
        const rightButtonDiv = document.createElement('div');
        rightButtonDiv.className = QuickTitleBar.Styles.QUICK_TITLE_RIGHT_BAR;

        this.createButtonElements(this.getRightButtons()).forEach(btn => rightButtonDiv.appendChild(btn));
        return rightButtonDiv;
    }

    // eslint-disable-next-line max-len
    public attachTitleBar(widgetNode: HTMLElement, title: string | undefined, step: number | undefined, totalSteps: number | undefined, buttons: ReadonlyArray<QuickTitleButton> | undefined): void {
        const div = this.createTitleBarDiv();

        this.updateInnerTitleText();

        this.title = title;
        this.step = step;
        this.totalSteps = totalSteps;
        this.buttons = buttons;

        div.appendChild(this.createLeftButtonDiv());
        div.appendChild(this.titleElement);
        div.appendChild(this.createRightButtonDiv());

        if (widgetNode.contains(this.titleBarContainer)) {
            widgetNode.removeChild(this.titleBarContainer);
        }
        widgetNode.prepend(div);

        this.titleBarContainer = div;
        this.attachedNode = widgetNode;
        this.isAttached = true;
    }

    hide(): void {
        this.title = undefined;
        this.buttons = undefined;
        this.step = undefined;
        this.totalSteps = undefined;
        this.isAttached = false;
        if (this.attachedNode && this.attachedNode.contains(this.titleBarContainer)) {
            this.attachedNode.removeChild(this.titleBarContainer);
        }
        this.attachedNode = undefined;
    }

    shouldShowTitleBar(title: string | undefined, step: number | undefined): boolean {
        return ((title !== undefined) || (step !== undefined));
    }

}

export namespace QuickTitleBar {
    export namespace Styles {
        export const QUICK_TITLE_CONTAINER = 'theia-quick-title-container';
        export const QUICK_TITLE_LEFT_BAR = 'theia-quick-title-left-bar';
        export const QUICK_TITLE_RIGHT_BAR = 'theia-quick-title-right-bar';
        export const QUICK_TITLE_HEADER = 'theia-quick-title-header';
        export const QUICK_TITLE_BUTTON = 'theia-quick-title-button';
    }
}
