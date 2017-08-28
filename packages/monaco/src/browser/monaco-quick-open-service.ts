/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';

export interface QuickOpenOptions extends monaco.quickOpen.IQuickOpenControllerOpts {
    onClose?(canceled: boolean): void;
}

@injectable()
export class MonacoQuickOpenService {

    protected readonly container: HTMLElement;
    protected widget: monaco.quickOpen.QuickOpenWidget | undefined;

    constructor(
    ) {
        const overlayWidgets = document.createElement('div');
        overlayWidgets.classList.add('quick-open-overlay');
        document.body.appendChild(overlayWidgets);

        const container = document.createElement('quick-open-container');
        container.style.position = 'absolute';
        container.style.top = '0px';
        container.style.right = '50%';
        overlayWidgets.appendChild(container);
        this.container = container;
    }

    open(options: QuickOpenOptions): monaco.quickOpen.QuickOpenWidget {
        if (this.widget) {
            this.widget.dispose();
        }
        const onClose = options.onClose || (() => { /*no-op*/ });
        const widget = this.widget = new monaco.quickOpen.QuickOpenWidget(this.container, {
            onOk: () => onClose(false),
            onCancel: () => onClose(true),
            onType: (lookFor: string) => {
                widget.setInput(options.getModel(lookFor), options.getAutoFocus(lookFor));
            },
            onFocusLost: () => false
        }, { inputAriaLabel: options.inputAriaLabel });
        this.widget.create();
        return widget;
    }

}
