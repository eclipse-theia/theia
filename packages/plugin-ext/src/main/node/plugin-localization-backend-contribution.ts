import * as express from 'express';
import { inject, injectable } from '@theia/core/shared/inversify';
import { LocalizationBackendContribution } from '@theia/core/lib/node/i18n/localization-backend-contribution';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PluginDeployer } from '../../common/plugin-protocol';
import { PluginDeployerImpl } from './plugin-deployer-impl';

@injectable()
export class PluginLocalizationBackendContribution extends LocalizationBackendContribution {
  @inject(PluginDeployer)
  protected readonly pluginDeployer: PluginDeployerImpl;

  protected readonly initialized = new Deferred<void>();

  override async initialize(): Promise<void> {
    this.pluginDeployer.onDidDeploy(() => {
      this.initialized.resolve();
    });
    return super.initialize();
  }

  override configure(app: express.Application): void {
    app.get('/i18n/:locale', async (req, res) => {
      let locale = req.params.locale;
      await this.initialized.promise;
      locale = this.localizationProvider
        .getAvailableLanguages()
        .some((e) => e.languageId === locale)
        ? locale
        : 'en';
      this.localizationProvider.setCurrentLanguage(locale);
      res.send(this.localizationProvider.loadLocalization(locale));
    });
  }
}
