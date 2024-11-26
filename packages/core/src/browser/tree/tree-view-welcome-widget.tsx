// *****************************************************************************
// Copyright (C) 2020 SAP SE or an SAP affiliate company and others.
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

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// some code is copied and modified from: https://github.com/microsoft/vscode/blob/573e5145ae3b50523925a6f6315d373e649d1b06/src/vs/base/common/linkedText.ts
// aligned the API and enablement behavior to https://github.com/microsoft/vscode/blob/c711bc9333ba339fde1a530de0094b3fa32f09de/src/vs/base/common/linkedText.ts

import React = require('react');
import { inject, injectable } from 'inversify';
import { URI as CodeUri } from 'vscode-uri';
import { CommandRegistry, DisposableCollection } from '../../common';
import URI from '../../common/uri';
import { ContextKeyService } from '../context-key-service';
import { LabelIcon, LabelParser } from '../label-parser';
import { OpenerService, open } from '../opener-service';
import { codicon } from '../widgets';
import { WindowService } from '../window/window-service';
import { TreeModel } from './tree-model';
import { TreeWidget } from './tree-widget';

export interface ViewWelcome {
    readonly view: string;
    readonly content: string;
    readonly when?: string;
    readonly enablement?: string;
    readonly order: number;
}

export interface IItem {
    readonly welcomeInfo: ViewWelcome;
    visible: boolean;
}

export interface ILink {
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

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    protected readonly toDisposeBeforeUpdateViewWelcomeNodes = new DisposableCollection();

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

    protected override renderTree(model: TreeModel): React.ReactNode {
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
        this.toDisposeBeforeUpdateViewWelcomeNodes.dispose();
        const items = this.visibleItems.sort((a, b) => a.order - b.order);

        const enablementKeys: Set<string>[] = [];
        // the plugin-view-registry will push the changes when there is a change in the `when` prop  which controls the visibility
        // this listener is to update the enablement of the components in the view welcome
        this.toDisposeBeforeUpdateViewWelcomeNodes.push(
            this.contextService.onDidChange(event => {
                if (enablementKeys.some(keys => event.affects(keys))) {
                    this.updateViewWelcomeNodes();
                    this.update();
                }
            })
        );
        // Note: VS Code does not support the `renderSecondaryButtons` prop in welcome content either.
        for (const { content, enablement } of items) {
            const itemEnablementKeys = enablement
                ? this.contextService.parseKeys(enablement)
                : undefined;
            if (itemEnablementKeys) {
                enablementKeys.push(itemEnablementKeys);
            }
            const lines = content.split('\n');

            for (let line of lines) {
                line = line.trim();

                if (!line) {
                    continue;
                }

                const linkedTextItems = this.parseLinkedText(line);

                if (linkedTextItems.length === 1 && typeof linkedTextItems[0] !== 'string') {
                    const node = linkedTextItems[0];
                    this.viewWelcomeNodes.push(
                        this.renderButtonNode(
                            node,
                            this.viewWelcomeNodes.length,
                            enablement
                        )
                    );
                } else {
                    const renderNode = (item: LinkedTextItem, index: number) => typeof item == 'string'
                        ? this.renderTextNode(item, index)
                        : this.renderLinkNode(item, index, enablement);

                    this.viewWelcomeNodes.push(
                        <p key={`p-${this.viewWelcomeNodes.length}`}>
                            {...linkedTextItems.flatMap(renderNode)}
                        </p>
                    );
                }
            }
        }
    }

    protected renderButtonNode(node: ILink, lineKey: string | number, enablement: string | undefined): React.ReactNode {
        return (
            <div key={`line-${lineKey}`} className='theia-WelcomeViewButtonWrapper'>
                <button title={node.title}
                    className='theia-button theia-WelcomeViewButton'
                    disabled={!this.isEnabledClick(enablement)}
                    onClick={e => this.openLinkOrCommand(e, node.href)}>
                    {node.label}
                </button>
            </div>
        );
    }

    protected renderTextNode(node: string, textKey: string | number): React.ReactNode {
        return <span key={`text-${textKey}`}>
            {this.labelParser.parse(node)
                .map((segment, index) =>
                    LabelIcon.is(segment)
                        ? <span
                            key={index}
                            className={codicon(segment.name)}
                        />
                        : <span key={index}>{segment}</span>)}</span>;
    }

    protected renderLinkNode(node: ILink, linkKey: string | number, enablement: string | undefined): React.ReactNode {
        return (
            <a key={`link-${linkKey}`}
                className={this.getLinkClassName(node.href, enablement)}
                title={node.title || ''}
                onClick={e => this.openLinkOrCommand(e, node.href)}>
                {node.label}
            </a>
        );
    }

    protected getLinkClassName(href: string, enablement: string | undefined): string {
        const classNames = ['theia-WelcomeViewCommandLink'];
        // Only command-backed links can be disabled. All other, https:, file: remain enabled
        if (href.startsWith('command:') && !this.isEnabledClick(enablement)) {
            classNames.push('disabled');
        }
        return classNames.join(' ');
    }

    protected isEnabledClick(enablement: string | undefined): boolean {
        return typeof enablement === 'string'
            ? this.contextService.match(enablement)
            : true;
    }

    protected openLinkOrCommand = (event: React.MouseEvent, value: string): void => {
        event.stopPropagation();

        if (value.startsWith('command:')) {
            const command = value.replace('command:', '');
            this.commands.executeCommand(command);
        } else if (value.startsWith('file:')) {
            const uri = value.replace('file:', '');
            open(this.openerService, new URI(CodeUri.file(uri).toString()));
        } else {
            this.windowService.openNewWindow(value, { external: true });
        }
    };

    protected parseLinkedText(text: string): LinkedTextItem[] {
        const result: LinkedTextItem[] = [];

        const linkRegex = /\[([^\]]+)\]\(((?:https?:\/\/|command:|file:)[^\)\s]+)(?: (["'])(.+?)(\3))?\)/gi;
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
