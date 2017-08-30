/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';

export interface QuickOpenOptions extends monaco.quickOpen.IQuickOpenControllerOpts {
    readonly prefix?: string;
    onClose?(canceled: boolean): void;
}

@injectable()
export class MonacoQuickOpenService {

    protected _widget: monaco.quickOpen.QuickOpenWidget | undefined;
    protected options: QuickOpenOptions | undefined;

    constructor() { }

    open(options: QuickOpenOptions): void {
        this.options = options;
        this.widget.show(options.prefix || '');
    }

    protected get widget(): monaco.quickOpen.QuickOpenWidget {
        if (this._widget) {
            return this._widget;
        }
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('quick-open-overlay');
        document.body.appendChild(overlayWidgets);

        const container = document.createElement('quick-open-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        overlayWidgets.appendChild(container);

        this._widget = new monaco.quickOpen.QuickOpenWidget(container, {
            onOk: () => this.onClose(false),
            onCancel: () => this.onClose(true),
            onType: lookFor => this.onType(lookFor || ''),
            onFocusLost: () => false
        }, {});
        this._widget.create();
        return this._widget;
    }

    protected onClose(cancelled: boolean): void {
        if (this.options && this.options.onClose) {
            this.options.onClose(cancelled);
        }
    }

    protected onType(lookFor: string): void {
        const options = this.options;
        if (this.widget && options) {
            this.widget.setInput(options.getModel(lookFor), options.getAutoFocus(lookFor), options.inputAriaLabel);
        }
    }

}
