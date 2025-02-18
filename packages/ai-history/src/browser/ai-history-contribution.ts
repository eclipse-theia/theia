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
import { FrontendApplication, codicon } from '@theia/core/lib/browser';
import { AIViewContribution } from '@theia/ai-core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIHistoryView } from './ai-history-widget';
import { Command, CommandRegistry, Emitter, nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommunicationRecordingService } from '@theia/ai-core';

export const AI_HISTORY_TOGGLE_COMMAND_ID = 'aiHistory:toggle';
export const OPEN_AI_HISTORY_VIEW = Command.toLocalizedCommand({
    id: 'aiHistory:open',
    label: 'Open AI History view',
});

export const AI_HISTORY_VIEW_SORT_CHRONOLOGICALLY = Command.toLocalizedCommand({
    id: 'aiHistory:sortChronologically',
    label: 'AI History: Sort chronologically',
    iconClass: codicon('arrow-down')
});

export const AI_HISTORY_VIEW_SORT_REVERSE_CHRONOLOGICALLY = Command.toLocalizedCommand({
    id: 'aiHistory:sortReverseChronologically',
    label: 'AI History: Sort reverse chronologically',
    iconClass: codicon('arrow-up')
});

export const AI_HISTORY_VIEW_CLEAR = Command.toLocalizedCommand({
    id: 'aiHistory:clear',
    label: 'AI History: Clear History',
    iconClass: codicon('clear-all')
});

@injectable()
export class AIHistoryViewContribution extends AIViewContribution<AIHistoryView> implements TabBarToolbarContribution {
    @inject(CommunicationRecordingService) private recordingService: CommunicationRecordingService;

    protected readonly chronologicalChangedEmitter = new Emitter<void>();
    protected readonly chronologicalStateChanged = this.chronologicalChangedEmitter.event;

    constructor() {
        super({
            widgetId: AIHistoryView.ID,
            widgetName: AIHistoryView.LABEL,
            defaultWidgetOptions: {
                area: 'bottom',
                rank: 100
            },
            toggleCommandId: AI_HISTORY_TOGGLE_COMMAND_ID,
        });
    }

    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    override registerCommands(registry: CommandRegistry): void {
        super.registerCommands(registry);
        registry.registerCommand(OPEN_AI_HISTORY_VIEW, {
            execute: () => this.openView({ activate: true }),
        });
        registry.registerCommand(AI_HISTORY_VIEW_SORT_CHRONOLOGICALLY, {
            isEnabled: widget => this.withHistoryWidget(widget, historyView => !historyView.isChronological),
            isVisible: widget => this.withHistoryWidget(widget, historyView => !historyView.isChronological),
            execute: widget => this.withHistoryWidget(widget, historyView => {
                historyView.sortHistory(true);
                this.chronologicalChangedEmitter.fire();
                return true;
            })
        });
        registry.registerCommand(AI_HISTORY_VIEW_SORT_REVERSE_CHRONOLOGICALLY, {
            isEnabled: widget => this.withHistoryWidget(widget, historyView => historyView.isChronological),
            isVisible: widget => this.withHistoryWidget(widget, historyView => historyView.isChronological),
            execute: widget => this.withHistoryWidget(widget, historyView => {
                historyView.sortHistory(false);
                this.chronologicalChangedEmitter.fire();
                return true;
            })
        });
        registry.registerCommand(AI_HISTORY_VIEW_CLEAR, {
            isEnabled: widget => this.withHistoryWidget(widget),
            isVisible: widget => this.withHistoryWidget(widget),
            execute: widget => this.withHistoryWidget(widget, () => {
                this.clearHistory();
                return true;
            })
        });
    }
    public clearHistory(): void {
        this.recordingService.clearHistory();
    }

    protected withHistoryWidget(
        widget: unknown = this.tryGetWidget(),
        predicate: (output: AIHistoryView) => boolean = () => true
    ): boolean | false {
        return widget instanceof AIHistoryView ? predicate(widget) : false;
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem({
            id: AI_HISTORY_VIEW_SORT_CHRONOLOGICALLY.id,
            command: AI_HISTORY_VIEW_SORT_CHRONOLOGICALLY.id,
            tooltip: nls.localize('theia/ai/history/sortChronologically/tooltip', 'Sort chronologically'),
            isVisible: widget => this.withHistoryWidget(widget),
            onDidChange: this.chronologicalStateChanged
        });
        registry.registerItem({
            id: AI_HISTORY_VIEW_SORT_REVERSE_CHRONOLOGICALLY.id,
            command: AI_HISTORY_VIEW_SORT_REVERSE_CHRONOLOGICALLY.id,
            tooltip: nls.localize('theia/ai/history/sortReverseChronologically/tooltip', 'Sort reverse chronologically'),
            isVisible: widget => this.withHistoryWidget(widget),
            onDidChange: this.chronologicalStateChanged
        });
        registry.registerItem({
            id: AI_HISTORY_VIEW_CLEAR.id,
            command: AI_HISTORY_VIEW_CLEAR.id,
            tooltip: nls.localize('theia/ai/history/clear/tooltip', 'Clear History of all agents'),
            isVisible: widget => this.withHistoryWidget(widget)
        });
    }
}
