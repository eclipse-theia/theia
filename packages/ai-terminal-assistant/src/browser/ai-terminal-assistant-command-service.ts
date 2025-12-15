import { Command, CommandRegistry } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';

export interface AiTerminalAssistantCommandService {
    commands: Command[];
    executeCommand(commandId: string, ctx: any): void;
}

export const AiTerminalAssistantCommandService = Symbol('AiTerminalAssistantCommandService');

@injectable()
export class AiTerminalAssistantCommandServiceImpl implements AiTerminalAssistantCommandService {
    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    commands: Command[] = [];

    @postConstruct()
    protected init(): void {
        this.commands = this.getAiTerminalAssistantCommands();
    }

    executeCommand(commandId: string, ctx: any): void {
        this.commandRegistry.executeCommand(commandId, ctx);
    }

    protected getAiTerminalAssistantCommands(): Command[] {
        const commands = this.commandRegistry.commands;
        return commands.filter(command => command.category === 'Ai Terminal Assistant');
    }
}
