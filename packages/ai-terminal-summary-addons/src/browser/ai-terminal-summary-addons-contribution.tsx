import * as React from 'react';
import { SummaryRendererRegistry } from '@theia/ai-terminal-summary/lib/browser/summary-renderer-registry';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { SummaryChatService } from './summary-addons-chat-service';

@injectable()
export class SummaryAddonsContribution {

    @inject(SummaryRendererRegistry)
    protected readonly summaryRendererRegistry: SummaryRendererRegistry;

    @inject(SummaryChatService)
    protected readonly summaryChatService: SummaryChatService;

    @postConstruct()
    protected init(): void {
        this.summaryRendererRegistry.registerRenderer(this.openChatSessionButton);
    }

    get openChatSessionButton(): React.FunctionComponent {
        const Renderer: React.FunctionComponent = () => (
            <OpenChatSessionButton summaryService={this.summaryChatService} />
        );
        return Renderer;
    }

}

const OpenChatSessionButton: React.FunctionComponent<{ summaryService: SummaryChatService }> = ({ summaryService }) => {

    const handleCreateNewChatSession = () => {
        summaryService.createNewChatSession();
    }

    return (
        <button className='theia-button' onClick={handleCreateNewChatSession} >
            Propose Solution
        </button>
    );
}
