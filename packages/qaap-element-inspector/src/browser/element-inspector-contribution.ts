// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { codicon } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { ElementInspectorWidget } from './element-inspector-widget';

export const ELEMENT_INSPECTOR_TOGGLE_COMMAND_ID = 'theia-mini-browser.element-inspector.toggle';
export const ELEMENT_INSPECTOR_REVEAL_COMMAND_ID = 'theia-mini-browser.element-inspector.reveal';

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
}

@injectable()
export class ElementInspectorContribution extends AbstractViewContribution<ElementInspectorWidget> {

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
    }
}
