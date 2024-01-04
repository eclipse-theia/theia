// tslint:disable:file-header
import { CommandContribution, CommandRegistry, MessageService } from '@theia/core';
import { ContainerModule, inject, injectable, interfaces } from '@theia/core/shared/inversify';

@injectable()
class SampleCommandContribution implements CommandContribution {
    @inject(MessageService) protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(
            {
                id: 'say-hi.command',
                category: 'Examples',
                label: 'Say Hi'
            }, {
            execute: () => {
                this.messageService.info('Hello world!')
            }
        });
    }

}

export default new ContainerModule((
    bind: interfaces.Bind,
    unbind: interfaces.Unbind,
    isBound: interfaces.IsBound,
    rebind: interfaces.Rebind,
) => {
    bind(CommandContribution).to(SampleCommandContribution);
});
