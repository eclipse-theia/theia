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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { AIChatContribution } from './ai-chat-ui-contribution';
import { Emitter, InMemoryResources, URI, nls } from '@theia/core';
import { ChatCommands } from './chat-view-commands';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { SessionSettingsDialog } from './session-settings-dialog';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { ChatViewWidget } from './chat-view-widget';
import { AIActivationService, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser';

@injectable()
export class ChatViewWidgetToolbarContribution implements TabBarToolbarContribution {
    @inject(AIChatContribution)
    protected readonly chatContribution: AIChatContribution;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(InMemoryResources)
    protected readonly resources: InMemoryResources;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    protected readonly onChatWidgetStateChangedEmitter = new Emitter<void>();
    protected readonly onChatWidgetStateChanged = this.onChatWidgetStateChangedEmitter.event;

    private readonly sessionSettingsURI = new URI('chat-view:/settings.json');

    @postConstruct()
    protected init(): void {
        this.resources.add(this.sessionSettingsURI, '{}');

        this.chatContribution.widget.then(widget => {
            widget.onStateChanged(() => this.onChatWidgetStateChangedEmitter.fire());
        });

        this.commandRegistry.registerCommand(ChatCommands.EDIT_SESSION_SETTINGS, {
            execute: () => this.openJsonDataDialog(),
            isEnabled: widget => this.activationService.isActive && widget instanceof ChatViewWidget,
            isVisible: widget => this.activationService.isActive && widget instanceof ChatViewWidget
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: ChatCommands.SCROLL_LOCK_WIDGET.id,
            command: ChatCommands.SCROLL_LOCK_WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling Off'),
            onDidChange: this.onChatWidgetStateChanged,
            priority: 2,
            when: ENABLE_AI_CONTEXT_KEY
        });
        registry.registerItem({
            id: ChatCommands.SCROLL_UNLOCK_WIDGET.id,
            command: ChatCommands.SCROLL_UNLOCK_WIDGET.id,
            tooltip: nls.localizeByDefault('Turn Auto Scrolling On'),
            onDidChange: this.onChatWidgetStateChanged,
            priority: 2,
            when: ENABLE_AI_CONTEXT_KEY
        });
        registry.registerItem({
            id: ChatCommands.EDIT_SESSION_SETTINGS.id,
            command: ChatCommands.EDIT_SESSION_SETTINGS.id,
            tooltip: nls.localize('theia/ai/session-settings-dialog/tooltip', 'Set Session Settings'),
            priority: 3,
            when: ENABLE_AI_CONTEXT_KEY
        });
    }

    protected async openJsonDataDialog(): Promise<void> {
        const widget = await this.chatContribution.widget;
        if (!widget) {
            return;
        }

        const dialog = new SessionSettingsDialog(this.editorProvider, this.resources, this.sessionSettingsURI, {
            initialSettings: widget.getSettings()
        });

        const result = await dialog.open();
        if (result) {
            widget.setSettings(result);
        }

    }
}
