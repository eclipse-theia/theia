/********************************************************************************
 * Copyright (C) 2021 YourCompany and others.
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

import { nls } from '@theia/core';
import { inject } from '@theia/core/shared/inversify';
import { AbstractDialog, Dialog, DialogProps, Message } from '@theia/core/lib/browser';

export class UntitledWorkspaceExitDialog extends AbstractDialog<UntitledWorkspaceExitDialog.Options> {
    protected readonly dontSaveButton: HTMLButtonElement;
    protected _value: UntitledWorkspaceExitDialog.Options = 'Cancel';

    get value(): UntitledWorkspaceExitDialog.Options {
        return this._value;
    }

    constructor(
        @inject(DialogProps) protected readonly props: DialogProps
    ) {
        super(props);
        const messageNode = document.createElement('div');
        messageNode.textContent = nls.localizeByDefault('Save your workspace if you plan to open it again.');
        this.contentNode.appendChild(messageNode);
        this.dontSaveButton = this.createButton(nls.localizeByDefault(UntitledWorkspaceExitDialog.Values["Don't Save"]));
        this.dontSaveButton.classList.add('secondary');
        this.controlPanel.appendChild(this.dontSaveButton);
        this.appendCloseButton(Dialog.CANCEL);
        this.appendAcceptButton(nls.localizeByDefault(UntitledWorkspaceExitDialog.Values.Save));
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.addAction(this.dontSaveButton, () => this.dontSave(), 'click');
    }

    protected addAcceptAction<K extends keyof HTMLElementEventMap>(element: HTMLElement, ...additionalEventTypes: K[]): void {
        this.addAction(element, () => this.doSave(), 'click');
    }

    protected dontSave(): void {
        this._value = UntitledWorkspaceExitDialog.Values["Don't Save"];
        this.accept();
    }

    protected doSave(): void {
        this._value = UntitledWorkspaceExitDialog.Values.Save;
        this.accept();
    }
}

export namespace UntitledWorkspaceExitDialog {
    export const enum Values {
        "Don't Save" = "Don't Save",
        Cancel = 'Cancel',
        Save = 'Save',
    };
    export type Options = keyof typeof Values;
}
