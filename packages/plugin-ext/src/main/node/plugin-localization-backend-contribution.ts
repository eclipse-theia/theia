import { inject, injectable } from '@theia/core/shared/inversify';
import { LocalizationBackendContribution } from '@theia/core/lib/node/i18n/localization-backend-contribution';
import { PluginDeployer } from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';
import { Deferred } from '@theia/core/src/common/promise-util';

@injectable()
export class PluginLocalizationBackendContribution extends LocalizationBackendContribution {
    @inject(PluginDeployer)
    protected readonly pluginDeployer: PluginDeployerImpl;

    override async initialize(): Promise<void> {
        const pluginsDeployed = new Deferred();
        this.pluginDeployer.onDidDeploy(() => {
            pluginsDeployed.resolve();
        });

        await Promise.all([this.localizationRegistry.initialize(), pluginsDeployed.promise]);
        this.initialized.resolve();
    }
}
