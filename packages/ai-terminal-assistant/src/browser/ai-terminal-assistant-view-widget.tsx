import { Event, deepClone } from '@theia/core';
import { BaseWidget, codicon, PanelLayout, StatefulWidget } from '@theia/core/lib/browser';
import { SummaryService } from './ai-terminal-assistant-service';
import { inject, postConstruct } from 'inversify';
import { ProgressBarFactory } from '@theia/core/lib/browser/progress-bar-factory';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { CommandService, PreferenceService } from '@theia/core';
import { SummaryViewWidget } from './ai-terminal-assistant-summary-widget';
import { AiTerminalBufferWidget } from './ai-terminal-assistant-buffer-widget';
import { Emitter } from 'vscode-languageserver-protocol';


export namespace AiTerminalAssistantView {
    export interface State {
        locked?: boolean;
        temporaryLocked?: boolean;
    }
}

export class AiTerminalAssistantViewWidget extends BaseWidget implements StatefulWidget {
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

    protected _state: AiTerminalAssistantView.State = { locked: false, temporaryLocked: false };
    protected readonly onStateChangedEmitter = new Emitter<AiTerminalAssistantView.State>();

    constructor(
        @inject(SummaryViewWidget)
        protected readonly summaryViewWidget: SummaryViewWidget,
        @inject(AiTerminalBufferWidget)
        protected readonly aiTerminalBufferWidget: AiTerminalBufferWidget
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

        this.update();
        const layout = this.layout = new PanelLayout();
        layout.addWidget(this.summaryViewWidget);
        layout.addWidget(this.aiTerminalBufferWidget);

    }

    storeState(): object {
        return this.state;
    }

    restoreState(oldState: object & Partial<AiTerminalAssistantView.State>): void {
        const copy = deepClone(this.state);
        if (oldState.locked) {
            copy.locked = oldState.locked;
        }
        // Don't restore temporary lock state as it should reset on restart
        copy.temporaryLocked = false;
        this.state = copy;
    }

    protected get state(): AiTerminalAssistantView.State {
        return this._state;
    }

    protected set state(state: AiTerminalAssistantView.State) {
        this._state = state;
        this.onStateChangedEmitter.fire(this._state);
    }

    get onStateChanged(): Event<AiTerminalAssistantView.State> {
        return this.onStateChangedEmitter.event;
    }


}
