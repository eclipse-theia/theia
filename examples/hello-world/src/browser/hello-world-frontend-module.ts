// tslint:disable:file-header
import { CommandContribution, CommandRegistry, ContributionFilterRegistry, FilterContribution, MessageService, bindContribution } from '@theia/core';
import { ContainerModule, inject, injectable, interfaces } from '@theia/core/shared/inversify';

@injectable()
class SampleCommandContribution implements CommandContribution {
    @inject(MessageService) protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(
            {
                id: 'command.examples.say-hi',
                category: 'Examples',
                label: 'Say Hi'
            }, {
            execute: () => {
                this.messageService.info('Hello world!')
            }
        });
    }
}

@injectable()
export class SampleFilterContribution implements FilterContribution {
    registerContributionFilters(registry: ContributionFilterRegistry): void {
        registry.addFilters('*', [
            // filter a contribution based on its class type
            contrib => {
                // // if (contrib.constructor.name.indexOf('Monaco') > -1) return false;
                // if (contrib.constructor.name.indexOf('EditorCommandContribution') > -1) return false;
                // if (contrib.constructor.name.indexOf('EditorMenuContribution') > -1) return false;
                // if (contrib.constructor.name.indexOf('WorkspaceSymbolCommand') > -1) return false;
                // if (contrib.constructor.name.indexOf('OutlineViewService') > -1) return false;
                // if (contrib.constructor.name.indexOf('OutlineViewContribution') > -1) return false;
                // console.log('contrib.constructor', contrib.constructor.name)
                // return !(contrib instanceof SampleCommandContribution);
                return true
            }
        ]);
    }
}


export default new ContainerModule((
    bind: interfaces.Bind,
    unbind: interfaces.Unbind,
    isBound: interfaces.IsBound,
    rebind: interfaces.Rebind,
) => {
    bind(CommandContribution).to(SampleCommandContribution).inSingletonScope();
    bind(SampleFilterContribution).toSelf().inSingletonScope();
    bindContribution(bind, SampleFilterContribution, [FilterContribution]);
});
