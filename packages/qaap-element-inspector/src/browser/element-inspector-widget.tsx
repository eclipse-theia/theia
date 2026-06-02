// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon, Message } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { ElementInspectorService } from './element-inspector-service';
import { ElementInspectorPanel } from './element-inspector-panel';
import {
    ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID,
    ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID,
    ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID,
} from './element-inspector-contribution';

@injectable()
export class ElementInspectorWidget extends ReactWidget {

    static readonly ID = 'theia-mini-browser:element-inspector';
    static readonly LABEL = nls.localize('theia/mini-browser/elementInspector', 'Element Inspector');

    @inject(ElementInspectorService)
    protected readonly service: ElementInspectorService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @postConstruct()
    protected init(): void {
        this.id = ElementInspectorWidget.ID;
        this.title.label = ElementInspectorWidget.LABEL;
        this.title.caption = ElementInspectorWidget.LABEL;
        this.title.iconClass = codicon('inspect');
        this.title.closable = true;
        this.addClass('theia-mini-browser-inspector');
        this.toDispose.push(this.service.onDidChangeState(() => this.update()));
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected render(): React.ReactNode {
        return (
            <ElementInspectorPanel
                service={this.service}
                onCopySelector={() => this.runCommand(ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID)}
                onAskAgent={() => this.runCommand(ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID)}
                onGenerateVariant={() => this.runCommand(ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID)}
            />
        );
    }

    protected runCommand(commandId: string): void {
        if (this.commands.isEnabled(commandId)) {
            void this.commands.executeCommand(commandId).catch(() => undefined);
        }
    }
}
