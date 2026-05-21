// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { codicon } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { ChatService } from '@theia/ai-chat/lib/common';
import { AI_CHAT_TOGGLE_COMMAND_ID } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { CoderAgentId } from '@theia/ai-ide/lib/browser/coder-agent';
import { ElementInspectorService } from './element-inspector-service';
import { ElementInspectorWidget } from './element-inspector-widget';
import {
    buildElementCssSelector,
    formatElementAgentPrompt,
    formatElementGenerateVariantPrompt,
    guessElementComponentPath,
} from './qaap-element-inspector-dom-utils';

export const ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID = 'theia-mini-browser.element-inspector.toggle';
export const ELEMENT_INSPECTOR_REVEAL_COMMAND_ID = 'theia-mini-browser.element-inspector.reveal';
export const ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID = 'qaap.element-inspector.copySelector';
export const ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID = 'qaap.element-inspector.askAgent';
export const ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID = 'qaap.element-inspector.generateVariant';

export namespace ElementInspectorCommands {
    export const TOGGLE: Command = {
        id: ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('theia/mini-browser/toggleElementInspector', 'Toggle Element Inspector'),
        iconClass: codicon('inspect')
    };
    export const REVEAL: Command = {
        id: ELEMENT_INSPECTOR_REVEAL_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('theia/mini-browser/revealElementInspector', 'Reveal Element Inspector')
    };
    export const COPY_SELECTOR: Command = {
        id: ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('qaap/elementInspector/copySelector', 'Copy selector / component path'),
        iconClass: codicon('copy')
    };
    export const ASK_AGENT: Command = {
        id: ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('qaap/elementInspector/askAgent', 'Ask agent about this element'),
        iconClass: codicon('comment-discussion')
    };
    export const GENERATE_VARIANT: Command = {
        id: ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID,
        category: nls.localize('theia/mini-browser/category', 'Mini Browser'),
        label: nls.localize('qaap/elementInspector/generateVariant', 'Generate UI variant in repo'),
        iconClass: codicon('sparkle')
    };
}

@injectable()
export class ElementInspectorContribution extends AbstractViewContribution<ElementInspectorWidget> {

    @inject(ElementInspectorService)
    protected readonly inspector: ElementInspectorService;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    constructor() {
        super({
            widgetId: ElementInspectorWidget.ID,
            widgetName: ElementInspectorWidget.LABEL,
            defaultWidgetOptions: {
                /** Full editor tab (Cursor-style), not the right side panel. */
                area: 'main',
                mode: 'tab-after'
            },
            toggleCommandId: ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID
        });
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(ElementInspectorCommands.REVEAL, {
            execute: () => this.openView({ activate: true, reveal: true })
        });
        registry.registerCommand(ElementInspectorCommands.COPY_SELECTOR, {
            execute: () => this.copySelector(),
            isEnabled: () => !!this.inspector.state.picked,
        });
        registry.registerCommand(ElementInspectorCommands.ASK_AGENT, {
            execute: () => this.askAgentAboutElement(),
            isEnabled: () => !!this.inspector.state.picked,
        });
        registry.registerCommand(ElementInspectorCommands.GENERATE_VARIANT, {
            execute: () => this.generateVariantInRepo(),
            isEnabled: () => !!this.inspector.state.picked,
        });
    }

    protected async copySelector(): Promise<void> {
        const picked = this.inspector.state.picked;
        if (!picked) {
            return;
        }
        const selector = buildElementCssSelector(picked);
        const componentPath = guessElementComponentPath(picked);
        const text = componentPath && componentPath !== picked.domPath
            ? `${selector}\n${componentPath}`
            : selector;
        try {
            await this.clipboard.writeText(text);
            this.messages.info(nls.localize('qaap/elementInspector/copied', 'Copied to clipboard.'));
        } catch {
            this.messages.warn(nls.localize('qaap/elementInspector/copyFailed', 'Could not copy to clipboard.'));
        }
    }

    protected async askAgentAboutElement(): Promise<void> {
        const picked = this.inspector.state.picked;
        if (!picked) {
            return;
        }
        try {
            await this.commands.executeCommand(AI_CHAT_TOGGLE_COMMAND_ID);
        } catch {
            // chat panel may already be open
        }
        let session = this.chatService.getActiveSession();
        if (!session) {
            session = this.chatService.createSession();
            this.chatService.setActiveSession(session.id);
        }
        const prompt = formatElementAgentPrompt(picked);
        await this.chatService.sendRequest(session.id, {
            text: `@${CoderAgentId} ${prompt}`,
        });
        await this.openView({ activate: false, reveal: true });
    }

    protected async generateVariantInRepo(): Promise<void> {
        const picked = this.inspector.state.picked;
        if (!picked) {
            return;
        }
        try {
            await this.commands.executeCommand(AI_CHAT_TOGGLE_COMMAND_ID);
        } catch {
            /* chat panel may already be open */
        }
        let session = this.chatService.getActiveSession();
        if (!session) {
            session = this.chatService.createSession();
            this.chatService.setActiveSession(session.id);
        }
        const prompt = formatElementGenerateVariantPrompt(picked);
        await this.chatService.sendRequest(session.id, {
            text: `@${CoderAgentId} ${prompt}`,
        });
        await this.openView({ activate: false, reveal: true });
    }
}
