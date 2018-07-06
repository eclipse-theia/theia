/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import { Disposable } from '@theia/core';
import { Widget, BaseWidget, Key, StatusBar } from '@theia/core/lib/browser';
import { ProgressWidget } from './progress-widget';

@injectable()
export class ProgressDialog extends BaseWidget {

    protected contentNode: HTMLDivElement;

    protected isOpen: boolean = false;

    @inject(ProgressWidget) readonly widget: ProgressWidget;
    @inject(StatusBar) protected readonly statusBar: StatusBar;

    constructor() {
        super();
        this.contentNode = document.createElement('div');
        this.contentNode.classList.add(ProgressWidget.Styles.PROGRESS_MONITOR_CONTENT);

        this.node.classList.add(ProgressWidget.Styles.PROGRESS_WIDGET_DIALOG);

        this.node.appendChild(this.contentNode);
        this.update();
    }

    @postConstruct()
    protected init() {
        this.toDispose.push(this.widget);
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.widget.update();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        Widget.attach(this.widget, this.contentNode);
        this.toDisposeOnDetach.push(Disposable.create(() =>
            Widget.detach(this.widget)
        ));

        this.addKeyListener(document.body, Key.ESCAPE, e => {
            this.closeDialog();
        });
        this.addEventListener(document.body, 'click', e => {
            this.closeDialog();
            e.stopPropagation();
        }, true);
    }

    closeDialog() {
        this.isOpen = false;
        this.close();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.widget.activate();
    }

    async toggleOpen(): Promise<void> {
        if (this.isOpen) {
            this.closeDialog();
        } else {
            const progressStatusBar = await this.statusBar.getElementByClass(ProgressWidget.Styles.PROGRESS_STATUS_BAR);
            Widget.attach(this, progressStatusBar[0] as HTMLElement);
            this.activate();
            this.isOpen = true;
        }
    }

}
