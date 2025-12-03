import { Command, CommandRegistry } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

export interface AiTerminalSummaryCommandService {
    commands: Command[];
    executeCommand(commandId: string, ctx: any): void;
}

export const AiTerminalSummaryCommandService = Symbol('AiTerminalSummaryCommandService');

@injectable()
export class AiTerminalSummaryCommandServiceImpl implements AiTerminalSummaryCommandService {
    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    commands: Command[] = [];

    @postConstruct()
    protected init(): void {
        this.commands = this.getAiTerminalCommands();
    }

    executeCommand(commandId: string, ctx: any): void {
        this.commandRegistry.executeCommand(commandId, ctx);
    }

    protected getAiTerminalCommands(): Command[] {
        const commands = this.commandRegistry.commands;
        return commands.filter(command => command.category === 'Ai Terminal');
    }
}
