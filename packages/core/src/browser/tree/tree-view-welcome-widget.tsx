/********************************************************************************
 * Copyright (c) 2020 SAP SE or an SAP affiliate company and others.
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

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// some code is copied and modified from: https://github.com/microsoft/vscode/blob/573e5145ae3b50523925a6f6315d373e649d1b06/src/vs/base/common/linkedText.ts

import React = require('react');
import { inject, injectable } from 'inversify';
import { CommandRegistry } from '../../common';
import { ContextKeyService } from '../context-key-service';
import { TreeModel } from './tree-model';
import { TreeWidget } from './tree-widget';
import { WindowService } from '../window/window-service';

interface ViewWelcome {
    readonly view: string;
    readonly content: string;
    readonly when?: string;
    readonly order: number;
}

interface IItem {
    readonly welcomeInfo: ViewWelcome;
    visible: boolean;
}

interface ILink {
    readonly label: string;
    readonly href: string;
    readonly title?: string;
}

type LinkedTextItem = string | ILink;

@injectable()
export class TreeViewWelcomeWidget extends TreeWidget {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ContextKeyService)
    protected readonly contextService: ContextKeyService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected viewWelcomeNodes: React.ReactNode[] = [];
    protected defaultItem: IItem | undefined;
    protected items: IItem[] = [];
    get visibleItems(): ViewWelcome[] {
        const visibleItems = this.items.filter(v => v.visible);
        if (visibleItems.length && this.defaultItem) {
            return [this.defaultItem.welcomeInfo];
        }
        return visibleItems.map(v => v.welcomeInfo);
    }

    protected renderTree(model: TreeModel): React.ReactNode {
        if (this.shouldShowWelcomeView() && this.visibleItems.length) {
            return this.renderViewWelcome();
        }
        return super.renderTree(model);
    }

    protected shouldShowWelcomeView(): boolean {
        return false;
    }

    protected renderViewWelcome(): React.ReactNode {
        return (
            <div className='theia-WelcomeView'>
                {...this.viewWelcomeNodes}
            </div>
        );
    }

    handleViewWelcomeContentChange(viewWelcomes: ViewWelcome[]): void {
        this.items = [];
        for (const welcomeInfo of viewWelcomes) {
            if (welcomeInfo.when === 'default') {
                this.defaultItem = { welcomeInfo, visible: true };
            } else {
                const visible = welcomeInfo.when === undefined || this.contextService.match(welcomeInfo.when);
                this.items.push({ welcomeInfo, visible });
            }
        }
        this.updateViewWelcomeNodes();
        this.update();
    }

    handleWelcomeContextChange(): void {
        let didChange = false;

        for (const item of this.items) {
            if (!item.welcomeInfo.when || item.welcomeInfo.when === 'default') {
                continue;
            }

            const visible = item.welcomeInfo.when === undefined || this.contextService.match(item.welcomeInfo.when);

            if (item.visible === visible) {
                continue;
            }

            item.visible = visible;
            didChange = true;
        }

        if (didChange) {
            this.updateViewWelcomeNodes();
            this.update();
        }
    }

    protected updateViewWelcomeNodes(): void {
        this.viewWelcomeNodes = [];
        const items = this.visibleItems.sort((a, b) => a.order - b.order);

        for (const [iIndex, { content }] of items.entries()) {
            const lines = content.split('\n');

            for (let [lIndex, line] of lines.entries()) {
                const lineKey = `${iIndex}-${lIndex}`;
                line = line.trim();

                if (!line) {
                    continue;
                }

                const linkedTextItems = this.parseLinkedText(line);

                if (linkedTextItems.length === 1 && typeof linkedTextItems[0] !== 'string') {
                    this.viewWelcomeNodes.push(
                        this.renderButtonNode(linkedTextItems[0], lineKey)
                    );
                } else {
                    const linkedTextNodes: React.ReactNode[] = [];

                    for (const [nIndex, node] of linkedTextItems.entries()) {
                        const linkedTextKey = `${lineKey}-${nIndex}`;

                        if (typeof node === 'string') {
                            linkedTextNodes.push(
                                this.renderTextNode(node, linkedTextKey)
                            );
                        } else {
                            linkedTextNodes.push(
                                this.renderCommandLinkNode(node, linkedTextKey)
                            );
                        }
                    }

                    this.viewWelcomeNodes.push(
                        <div key={`line-${lineKey}`}>
                            {...linkedTextNodes}
                        </div>
                    );
                }
            }
        }
    }

    protected renderButtonNode(node: ILink, lineKey: string): React.ReactNode {
        return (
            <div key={`line-${lineKey}`} className='theia-WelcomeViewButtonWrapper'>
                <button title={node.title}
                    className='theia-button theia-WelcomeViewButton'
                    disabled={!this.isEnabledClick(node.href)}
                    onClick={e => this.openLinkOrCommand(e, node.href)}>
                    {node.label}
                </button>
            </div>
        );
    }

    protected renderTextNode(node: string, textKey: string): React.ReactNode {
        return <span key={`text-${textKey}`}>{node}</span>;
    }

    protected renderCommandLinkNode(node: ILink, linkKey: string): React.ReactNode {
        return (
            <a key={`link-${linkKey}`}
                className={this.getLinkClassName(node.href)}
                title={node.title || ''}
                onClick={e => this.openLinkOrCommand(e, node.href)}>
                {node.label}
            </a>
        );
    }

    protected getLinkClassName(href: string): string {
        const classNames = ['theia-WelcomeViewCommandLink'];
        if (!this.isEnabledClick(href)) {
            classNames.push('disabled');
        }
        return classNames.join(' ');
    }

    protected isEnabledClick(href: string): boolean {
        if (href.startsWith('command:')) {
            const command = href.replace('command:', '');
            return this.commands.isEnabled(command);
        }
        return true;
    }

    protected openLinkOrCommand = (event: React.MouseEvent, href: string): void => {
        event.stopPropagation();

        if (href.startsWith('command:')) {
            const command = href.replace('command:', '');
            this.commands.executeCommand(command);
        } else {
            this.windowService.openNewWindow(href, { external: true });
        }
    };

    protected parseLinkedText(text: string): LinkedTextItem[] {
        const result: LinkedTextItem[] = [];

        const linkRegex = /\[([^\]]+)\]\(((?:https?:\/\/|command:)[^\)\s]+)(?: ("|')([^\3]+)(\3))?\)/gi;
        let index = 0;
        let match: RegExpExecArray | null;

        while (match = linkRegex.exec(text)) {
            if (match.index - index > 0) {
                result.push(text.substring(index, match.index));
            }

            const [, label, href, , title] = match;

            if (title) {
                result.push({ label, href, title });
            } else {
                result.push({ label, href });
            }

            index = match.index + match[0].length;
        }

        if (index < text.length) {
            result.push(text.substring(index));
        }

        return result;
    }
}
