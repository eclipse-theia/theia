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

import { Emitter } from '../../common/event';
import { DisposableCollection } from '../../common/disposable';
import { injectable } from 'inversify';

export enum QuickInputTitleButtonSide {
    LEFT = 0,
    RIGHT = 1
}

export interface QuickInputTitleButton {
    icon: string; // a background image coming from a url
    iconClass?: string; // a class such as one coming from font awesome
    tooltip?: string | undefined;
    side: QuickInputTitleButtonSide
}

@injectable()
export class QuickTitleBar {

    private readonly onDidTriggerButtonEmitter: Emitter<QuickInputTitleButton>;
    private _isAttached: boolean;

    private titleElement: HTMLElement;
    private titleBarContainer: HTMLElement;
    private attachedNode: HTMLElement | undefined;

    private _title: string | undefined;
    private _step: number | undefined;
    private _totalSteps: number | undefined;
    private _buttons: ReadonlyArray<QuickInputTitleButton>;

    private tabIndex = 2; // Keep track of the tabIndex for the buttons

    private disposableCollection: DisposableCollection;
    constructor() {
        this.titleElement = document.createElement('h3');
        this.titleElement.style.textAlign = 'center';
        this.titleElement.style.margin = '0';

        this.disposableCollection = new DisposableCollection();
        this.disposableCollection.push(this.onDidTriggerButtonEmitter = new Emitter());
    }

    get onDidTriggerButton() {
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

    set buttons(buttons: ReadonlyArray<QuickInputTitleButton> | undefined) {
        if (buttons === undefined) {
            this._buttons = [];
            return;
        }

        this._buttons = buttons;
    }

    get buttons() {
        return this._buttons;
    }

    private updateInnerTitleText(): void {
        let innerTitle = '';

        if (this.title) {
            innerTitle = this.title + ' ';
        }

        if (this.step && this.totalSteps) {
            innerTitle += `(${this.step} / ${this.totalSteps})`;
        } else if (this.step) {
            innerTitle += this.step;
        }

        this.titleElement.innerText = innerTitle;
    }

    // Left buttons are for the buttons dervied from QuickInputButtons
    private getLeftButtons() {
        if (this._buttons === undefined || this._buttons.length === 0) {
            return [];
        }
        return this._buttons.filter(btn => btn.side === QuickInputTitleButtonSide.LEFT);
    }

    private getRightButtons() {
        if (this._buttons === undefined || this._buttons.length === 0) {
            return [];
        }
        return this._buttons.filter(btn => btn.side === QuickInputTitleButtonSide.RIGHT);
    }

    private createButtonElement(buttons: ReadonlyArray<QuickInputTitleButton>) {
        const buttonDiv = document.createElement('div');
        buttonDiv.style.display = 'inline-flex';
        for (const btn of buttons) {
            const aElement = document.createElement('a');
            aElement.style.width = '16px';
            aElement.style.height = '16px';
            aElement.tabIndex = 0;
            if (btn.iconClass) {
                aElement.classList.add(...btn.iconClass.split(' '));
            }

            if (btn.icon !== '') {
                aElement.style.backgroundImage = `url(\'${btn.icon}\')`;
            }

            aElement.classList.add('icon');
            aElement.style.display = 'flex';
            aElement.style.justifyContent = 'center';
            aElement.style.alignItems = 'center';
            aElement.style.cursor = 'pointer';
            aElement.tabIndex = this.tabIndex;
            aElement.title = btn.tooltip ? btn.tooltip : '';
            aElement.onclick = () => {
                this.onDidTriggerButtonEmitter.fire(btn);
            };
            aElement.onkeyup = event => {
                if (event.code === 'Enter') {
                    aElement.click();
                }
            };
            buttonDiv.appendChild(aElement);
            this.tabIndex += 1;
        }
        return buttonDiv;
    }

    private createTitleBarDiv() {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.flexDirection = 'row';
        div.style.fontSize = '13px';
        div.style.padding = '0px 1px';
        div.style.justifyContent = 'flex-start';
        div.style.alignItems = 'center';
        div.style.background = 'var(--theia-layout-color4)';
        div.onclick = event => {
            event.stopPropagation();
            event.preventDefault();
        };
        return div;
    }

    private createLeftButtonDiv() {
        const leftButtonDiv = document.createElement('div'); // Holds all the buttons that get added to the left
        leftButtonDiv.style.flex = '1';
        leftButtonDiv.style.textAlign = 'left';

        leftButtonDiv.appendChild(this.createButtonElement(this.getLeftButtons()));
        return leftButtonDiv;
    }

    private createRightButtonDiv() {
        const rightButtonDiv = document.createElement('div');
        rightButtonDiv.style.flex = '1';
        rightButtonDiv.style.textAlign = 'right';

        rightButtonDiv.appendChild(this.createButtonElement(this.getRightButtons()));
        return rightButtonDiv;
    }

    // tslint:disable-next-line:max-line-length
    public attachTitleBar(widgetNode: HTMLElement, title: string | undefined, step: number | undefined, totalSteps: number | undefined, buttons: ReadonlyArray<QuickInputTitleButton> | undefined) {
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

    hide() {
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

    dispose() {
        this.disposableCollection.dispose();
    }

}
