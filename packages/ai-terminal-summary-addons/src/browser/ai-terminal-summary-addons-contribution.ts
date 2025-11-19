import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { SummaryChatService } from './summary-addons-chat-service';
import { CommandContribution, CommandRegistry } from '@theia/core';

export const ProposeSolution = {
    id: 'ai-terminal-addons.proposeSolution',
    category: 'AI Terminal',
    label: 'Propose Solution'
}

@injectable()
export class SummaryAddonsCommandContribution implements CommandContribution {

    @inject(SummaryChatService)
    protected readonly summaryChatService: SummaryChatService;

    @postConstruct()
    protected init(): void { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(ProposeSolution, {
            execute: async () => {
                this.summaryChatService.startSolutionProposalSession();
            }
        });
    }

}
