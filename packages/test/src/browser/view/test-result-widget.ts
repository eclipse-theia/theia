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

import { BaseWidget, Message, codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TestOutputUIModel } from './test-output-ui-model';
import { DisposableCollection, nls } from '@theia/core';
import { TestFailure, TestMessage } from '../test-service';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';

@injectable()
export class TestResultWidget extends BaseWidget {

    static readonly ID = 'test-result-widget';

    @inject(TestOutputUIModel) uiModel: TestOutputUIModel;
    @inject(MarkdownRenderer) markdownRenderer: MarkdownRenderer;

    protected toDisposeOnRender = new DisposableCollection();
    protected input: TestMessage[] = [];
    protected content: HTMLDivElement;

    constructor() {
        super();
        this.id = TestResultWidget.ID;
        this.title.label = nls.localizeByDefault('Test Results');
        this.title.caption = nls.localizeByDefault('Test Results');
        this.title.iconClass = codicon('checklist');
        this.title.closable = true;
        this.scrollOptions = {
            minScrollbarLength: 35,
        };
    }

    @postConstruct()
    init(): void {
        this.uiModel.onDidChangeSelectedTestState(e => {
            if (TestFailure.is(e)) {
                this.setInput(e.messages);
            }
        });
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.content = this.node.ownerDocument.createElement('div');
        this.node.append(this.content);
    }

    setInput(messages: TestMessage[]): void {
        this.input = messages;
        this.update();
    }

    protected override onUpdateRequest(msg: Message): void {
        this.render();
        super.onUpdateRequest(msg);
    }

    render(): void {
        this.toDisposeOnRender.dispose();
        this.toDisposeOnRender = new DisposableCollection();
        this.content.innerHTML = '';
        this.input.forEach(message => {
            if (MarkdownString.is(message.message)) {
                const line = this.markdownRenderer.render(message.message);
                this.content.append(line.element);
                this.toDisposeOnRender.push(line);
            } else {
                this.content.append(this.node.ownerDocument.createTextNode(message.message));
            }
        });
    }

    override dispose(): void {
        this.toDisposeOnRender.dispose();
    }
}
