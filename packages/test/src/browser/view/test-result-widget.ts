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

import { BaseWidget, LabelProvider, Message, OpenerService, codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TestOutputUIModel } from './test-output-ui-model';
import { DisposableCollection, nls } from '@theia/core';
import { TestFailure, TestMessage, TestMessageStackFrame } from '../test-service';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { URI } from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { NavigationLocationService } from '@theia/editor/lib/browser/navigation/navigation-location-service';
import { NavigationLocation, Position } from '@theia/editor/lib/browser/navigation/navigation-location';

@injectable()
export class TestResultWidget extends BaseWidget {

    static readonly ID = 'test-result-widget';

    @inject(TestOutputUIModel) uiModel: TestOutputUIModel;
    @inject(MarkdownRenderer) markdownRenderer: MarkdownRenderer;
    @inject(OpenerService) openerService: OpenerService;
    @inject(FileService) fileService: FileService;
    @inject(NavigationLocationService) navigationService: NavigationLocationService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;

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
            if (message.stackTrace) {
                message.stackTrace.map(frame => this.renderFrame(frame));
            }
        });
    }

    renderFrame(stackFrame: TestMessageStackFrame): void {
        const frameElement = this.node.ownerDocument.createElement('div');
        frameElement.append(this.node.ownerDocument.createTextNode(stackFrame.label));

        // Add URI information as clickable links
        if (stackFrame.uri) {

            const uri = stackFrame.uri;
            frameElement.append(' from ');
            const link = this.node.ownerDocument.createElement('a');
            link.textContent = `${this.labelProvider.getName(uri)}`;
            link.title = `${uri}`;
            link.onclick = () => this.openUriInWorkspace(uri, stackFrame.position);
            frameElement.append(link);
        }
        this.content.append(frameElement);
    }

    async openUriInWorkspace(uri: URI, position?: Position): Promise<void> {
        this.fileService.resolve(uri).then(stat => {
            if (stat.isFile) {
                this.navigationService.reveal(NavigationLocation.create(uri, position ?? { line: 0, character: 0 }));
            }
        });
    }

    override dispose(): void {
        this.toDisposeOnRender.dispose();
    }
}
