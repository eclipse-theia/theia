/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { MessageService, CommandRegistry } from '@theia/core/lib/common';
import { Window, OutputChannel, MessageActionItem, MessageType } from 'monaco-languageclient/lib/services';

@injectable()
export class WindowImpl implements Window {

    private canAccessOutput: boolean | undefined;
    protected static readonly NOOP_CHANNEL: OutputChannel = {
        append: () => { },
        appendLine: () => { },
        dispose: () => { },
        show: () => { }
    };

    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;

    showMessage<T extends MessageActionItem>(type: MessageType, message: string, ...actions: T[]): Thenable<T | undefined> {
        const originalActions = new Map((actions || []).map(action => [action.title, action] as [string, T]));
        const actionTitles = (actions || []).map(action => action.title);
        const mapActionType: (result: string | undefined) => (T | undefined) = result => {
            if (!!result) {
                return originalActions.get(result);
            }
            return undefined;
        };
        if (type === MessageType.Error) {
            return this.messageService.error(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Warning) {
            return this.messageService.warn(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Info) {
            return this.messageService.info(message, ...actionTitles).then(mapActionType);
        }
        if (type === MessageType.Log) {
            return this.messageService.log(message, ...actionTitles).then(mapActionType);
        }
        return Promise.resolve(undefined);
    }

    createOutputChannel(name: string): OutputChannel {
        // Note: alternatively, we could add `@theia/output` as a `devDependency` and check, for instance,
        // the manager for the output channels can be injected or not with `@optional()` but this approach has the same effect.
        // The `@theia/languages` extension will be removed anyway: https://github.com/eclipse-theia/theia/issues/7100
        if (this.canAccessOutput === undefined) {
            this.canAccessOutput = !!this.commandRegistry.getCommand('output:append');
        }
        if (!this.canAccessOutput) {
            return WindowImpl.NOOP_CHANNEL;
        }
        return {
            append: text => this.commandRegistry.executeCommand('output:append', { name, text }),
            appendLine: text => this.commandRegistry.executeCommand('output:appendLine', { name, text }),
            dispose: () => this.commandRegistry.executeCommand('output:dispose', { name }),
            show: (preserveFocus: boolean = false) => this.commandRegistry.executeCommand('output:show', { name, options: { preserveFocus } })
        };
    }
}
