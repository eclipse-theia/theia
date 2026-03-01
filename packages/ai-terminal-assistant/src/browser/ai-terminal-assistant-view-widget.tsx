// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { BaseWidget, codicon, PanelLayout } from '@theia/core/lib/browser';
import { SummaryService } from './ai-terminal-assistant-service';
import { ProgressBarFactory } from '@theia/core/lib/browser/progress-bar-factory';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { CommandService, PreferenceService } from '@theia/core';
import { SummaryViewWidget } from './ai-terminal-assistant-summary-widget';
import { AiTerminalBufferWidget } from './ai-terminal-assistant-buffer-widget';
import { Summary } from './terminal-output-analysis-agent';
import { inject, postConstruct } from '@theia/core/shared/inversify';
import { AiTerminalAssistantPreferences } from './ai-terminal-assistant-preferences';

export class AiTerminalAssistantViewWidget extends BaseWidget {
    static readonly ID = 'ai-terminal-assistant-view';
    static readonly LABEL = 'AI Terminal Assistant';

    @inject(SummaryService)
    protected readonly summaryService: SummaryService;

    @inject(ProgressBarFactory)
    protected readonly progressBarFactory: ProgressBarFactory;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(AiTerminalAssistantPreferences)
    protected readonly aiTerminalAssistantPreferences: AiTerminalAssistantPreferences;

    protected _isStandAlone: boolean;
    constructor(
        @inject(SummaryViewWidget)
        protected readonly summaryViewWidget: SummaryViewWidget,
        @inject(AiTerminalBufferWidget)
        protected readonly aiTerminalBufferWidget: AiTerminalBufferWidget,
    ) {
        super();
        this.id = AiTerminalAssistantViewWidget.ID;
        this.title.label = AiTerminalAssistantViewWidget.LABEL;
        this.title.iconClass = codicon('sparkle');
        this.title.closable = true;
        this.addClass('ai-terminal-assistant-view');
        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            this.summaryViewWidget,
            this.aiTerminalBufferWidget
        ]);

        this._isStandAlone = this.aiTerminalAssistantPreferences['terminal.aiAssistant.mode'] === 'standalone';

        this.update();
        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.summaryViewWidget);
        if (this._isStandAlone) {
            layout.addWidget(this.aiTerminalBufferWidget);
        }

        this.toDispose.push(
            // Listen to summary changes to update border
            this.summaryService.onSummaryRequestFinished((summary: Summary | undefined) => {
                this.updateBorderClass(summary);
            }),
        );

        this.toDispose.push(
            this.aiTerminalAssistantPreferences.onPreferenceChanged(event => {
                if (event.preferenceName === 'terminal.aiAssistant.mode') {
                    this._isStandAlone = this.aiTerminalAssistantPreferences['terminal.aiAssistant.mode'] === 'standalone';
                    this.update();
                }
            })
        )


        // Set initial border state
        this.updateBorderClass(this.summaryService.currentSummary);
    }

    protected updateBorderClass(summary: Summary | undefined): void {
        this.removeClass('success-border');
        this.removeClass('error-border');
        this.removeClass('neutral-border');

        if (summary) {
            this.addClass(summary.isSuccessful ? 'success-border' : 'error-border');
        } else {
            this.addClass('neutral-border');
        }
    }


}
