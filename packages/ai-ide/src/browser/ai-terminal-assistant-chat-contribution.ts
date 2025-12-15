import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { SummaryChatService } from './ai-terminal-assistant-chat-service';
import { CommandContribution, CommandRegistry } from '@theia/core';

export const ProposeSolution = {
    id: 'ai-terminal-assistant.proposeSolution',
    category: 'Ai Terminal Assistant',
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
            execute: async (...args: any[]) => {
                this.summaryChatService.startSolutionChatSession(args[0]);
            },
        });
    }

}
