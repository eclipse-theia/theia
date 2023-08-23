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
import { ReactTabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ReactNode } from '@theia/core/shared/react';
import React = require('@theia/core/shared/react');
import { HoverService, Widget } from '@theia/core/lib/browser';
import { TerminalWidget } from './base/terminal-widget';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { DisposableCollection } from '@theia/core';

export class TerminalInfoToolbarItem implements ReactTabBarToolbarItem {
    readonly id = 'terminal:info';

    constructor(
        protected readonly hoverService: HoverService,
        protected readonly markdownRenderer: MarkdownRenderer
    ) {}

    isVisible(widget?: Widget): boolean {
        return widget instanceof TerminalWidget;
    }

    render(widget?: Widget): ReactNode {
        const toDispose = new DisposableCollection();
        return (
            <div
                id={this.id}
                className='codicon codicon-terminal-bash action-label'
                onMouseEnter={e => this.onMouseEnter(e, toDispose, widget)}
                onMouseLeave={e => this.onMouseLeave(toDispose)}
            ></div>
        );
    }

    protected async onMouseEnter(
        event: React.MouseEvent<HTMLElement, MouseEvent>, toDispose: DisposableCollection, currentTerminal?: Widget
    ): Promise<void> {
        const currentTarget = event.currentTarget;
        if (currentTerminal instanceof TerminalWidget) {
            const extensions = await currentTerminal.envVarCollectionDescriptionsByExtension;
            const processId = await currentTerminal.processId;
            const processInfo = await currentTerminal.processInfo;

            const mainDiv = document.createElement('div');

            const pid = document.createElement('div');
            pid.textContent = 'Process ID: ' + processId;
            mainDiv.appendChild(pid);

            const commandLine = document.createElement('div');
            commandLine.textContent =
                'Command line: ' +
                processInfo.executable +
                ' ' +
                processInfo.arguments.join(' ');
            mainDiv.appendChild(commandLine);

            mainDiv.appendChild(document.createElement('hr'));

            const header = document.createElement('div');
            header.textContent =
                'The following extensions have contributed to this terminal\'s environment:';
            mainDiv.appendChild(header);

            const list = document.createElement('ul');
            mainDiv.appendChild(list);

            extensions.forEach((value, key) => {
                const item = document.createElement('li');
                let markdown;
                if (value === undefined) {
                    markdown = new MarkdownStringImpl('');
                    markdown.appendText(key);
                } else if (typeof value === 'string') {
                    markdown = new MarkdownStringImpl('');
                    markdown.appendText(key + ': ' + value);
                } else {
                    markdown = new MarkdownStringImpl('', value);
                    markdown.appendText(key + ': ');
                    markdown.appendMarkdown(value.value);
                }
                const result = this.markdownRenderer.render(markdown);
                toDispose.push(result);
                item.appendChild(result.element);
                list.appendChild(item);
            });

            this.hoverService.requestHover({
                content: mainDiv,
                target: currentTarget,
                position: 'right',
            });
        }
    }

    protected async onMouseLeave(hoverResources: DisposableCollection): Promise<void> {
        hoverResources.dispose();
    }
}
