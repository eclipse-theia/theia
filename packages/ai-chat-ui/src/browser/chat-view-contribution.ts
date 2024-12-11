// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { Command, CommandContribution, CommandRegistry, CommandService, isObject, MenuContribution, MenuModelRegistry } from '@theia/core';
import { CommonCommands, TreeNode } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChatViewTreeWidget, isRequestNode, isResponseNode, RequestNode, ResponseNode } from './chat-tree-view/chat-view-tree-widget';
import { AIChatInputWidget } from './chat-input-widget';

export namespace ChatViewCommands {
    export const COPY_MESSAGE = Command.toDefaultLocalizedCommand({
        id: 'chat.copy.message',
        label: 'Copy Message'
    });
    export const COPY_ALL = Command.toDefaultLocalizedCommand({
        id: 'chat.copy.all',
        label: 'Copy All'
    });
    export const COPY_CODE = Command.toDefaultLocalizedCommand({
        id: 'chat.copy.code',
        label: 'Copy Code Block'
    });
}

@injectable()
export class ChatViewMenuContribution implements MenuContribution, CommandContribution {

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerHandler(CommonCommands.COPY.id, {
            execute: (...args: unknown[]) => {
                if (window.getSelection()?.type !== 'Range' && containsRequestOrResponseNode(args)) {
                    this.copyMessage(extractRequestOrResponseNodes(args));
                } else {
                    this.commandService.executeCommand(CommonCommands.COPY.id);
                }
            },
            isEnabled: (...args: unknown[]) => containsRequestOrResponseNode(args)
        });
        commands.registerCommand(ChatViewCommands.COPY_MESSAGE, {
            execute: (...args: unknown[]) => {
                if (containsRequestOrResponseNode(args)) {
                    this.copyMessage(extractRequestOrResponseNodes(args));
                }
            },
            isEnabled: (...args: unknown[]) => containsRequestOrResponseNode(args)
        });
        commands.registerCommand(ChatViewCommands.COPY_ALL, {
            execute: (...args: unknown[]) => {
                if (containsRequestOrResponseNode(args)) {
                    const parent = extractRequestOrResponseNodes(args).find(arg => arg.parent)?.parent;
                    const text = parent?.children
                        .filter(isRequestOrResponseNode)
                        .map(child => this.getText(child))
                        .join('\n\n---\n\n');
                    if (text) {
                        this.clipboardService.writeText(text);
                    }
                }
            },
            isEnabled: (...args: unknown[]) => containsRequestOrResponseNode(args)
        });
        commands.registerCommand(ChatViewCommands.COPY_CODE, {
            execute: (...args: unknown[]) => {
                if (containsCode(args)) {
                    const code = args
                        .filter(isCodeArg)
                        .map(arg => arg.code)
                        .join();
                    this.clipboardService.writeText(code);
                }
            },
            isEnabled: (...args: unknown[]) => containsRequestOrResponseNode(args) && containsCode(args)
        });
    }

    protected copyMessage(args: (RequestNode | ResponseNode)[]): void {
        const text = this.getTextAndJoin(args);
        this.clipboardService.writeText(text);
    }

    protected getTextAndJoin(args: (RequestNode | ResponseNode)[] | undefined): string {
        return args !== undefined ? args.map(arg => this.getText(arg)).join() : '';
    }

    protected getText(arg: RequestNode | ResponseNode): string {
        if (isRequestNode(arg)) {
            return arg.request.request.text;
        } else if (isResponseNode(arg)) {
            return arg.response.response.asString();
        }
        return '';
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.COPY.id
        });
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: ChatViewCommands.COPY_MESSAGE.id
        });
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: ChatViewCommands.COPY_ALL.id
        });
        menus.registerMenuAction([...ChatViewTreeWidget.CONTEXT_MENU, '_1'], {
            commandId: ChatViewCommands.COPY_CODE.id
        });
        menus.registerMenuAction([...AIChatInputWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.COPY.id
        });
        menus.registerMenuAction([...AIChatInputWidget.CONTEXT_MENU, '_1'], {
            commandId: CommonCommands.PASTE.id
        });
    }

}

function extractRequestOrResponseNodes(args: unknown[]): (RequestNode | ResponseNode)[] {
    return args.filter(arg => isRequestOrResponseNode(arg)) as (RequestNode | ResponseNode)[];
}

function containsRequestOrResponseNode(args: unknown[]): args is (unknown | RequestNode | ResponseNode)[] {
    return extractRequestOrResponseNodes(args).length > 0;
}

function isRequestOrResponseNode(arg: unknown): arg is RequestNode | ResponseNode {
    return TreeNode.is(arg) && (isRequestNode(arg) || isResponseNode(arg));
}

function containsCode(args: unknown[]): args is (unknown | { code: string })[] {
    return args.filter(arg => isCodeArg(arg)).length > 0;
}

function isCodeArg(arg: unknown): arg is { code: string } {
    return isObject(arg) && 'code' in arg;
}
