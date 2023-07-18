// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

/* eslint-disable no-null/no-null, @typescript-eslint/no-explicit-any */

import { Message } from '@theia/core/shared/@phosphor/messaging';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { BaseWidget, ApplicationShell, MessageLoop, Widget, codicon } from '@theia/core/lib/browser';
import { TestService } from '../test-service';
import { Disposable, Emitter, Event, nls } from '@theia/core';
import { TestTreeWidget } from './test-tree-widget';

@injectable()
export class TestWidget extends BaseWidget {

    protected contentNode: HTMLElement;
    protected testContainer: HTMLElement;

    static ID = 'test-view';
    static LABEL = nls.localizeByDefault('Testing');

    protected readonly onDidUpdateEmitter = new Emitter<void>();
    readonly onDidUpdate: Event<void> = this.onDidUpdateEmitter.event;

    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(TestTreeWidget) readonly testTreeWidget: TestTreeWidget;
    @inject(TestService) protected readonly testService: TestService;

    @postConstruct()
    protected init(): void {
        this.id = TestWidget.ID;
        this.title.label = TestWidget.LABEL;
        this.title.caption = TestWidget.LABEL;
        this.title.iconClass = codicon('beaker');
        this.title.closable = true;

        this.contentNode = document.createElement('div');
        this.contentNode.classList.add('theia-test-container');
        this.node.tabIndex = 0;
        this.node.appendChild(this.contentNode);

        this.toDispose.push(this.testTreeWidget);
        this.toDispose.push(this.testTreeWidget.onExpansionChanged(() => {
            this.onDidUpdateEmitter.fire();
        }));
    }

    refresh(): void {
        this.testTreeWidget.populateTests();
        this.update();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        Widget.attach(this.testTreeWidget, this.contentNode);
        this.toDisposeOnDetach.push(Disposable.create(() => {
            Widget.detach(this.testTreeWidget);
        }));
    }

    protected override onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        MessageLoop.sendMessage(this.testTreeWidget, Widget.ResizeMessage.UnknownSize);
    }

    protected hasTests(): boolean {
        // return true;
        return this.testService.getControllers().length > 0;
    }
}
