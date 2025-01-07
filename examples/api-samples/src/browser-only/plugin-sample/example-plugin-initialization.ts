import { interfaces } from '@theia/core/shared/inversify';
import { PluginLocalOptions } from '@theia/plugin-ext/lib/hosted/browser-only/frontend-hosted-plugin-server';
import { staticMetadata } from './example-static-plugin-metadata';


export const bindPluginInitialization = (bind: interfaces.Bind, rebind: interfaces.Rebind): void => {
    const pluginLocalOptions = {
        pluginMetadata: staticMetadata,
    };
    bind(PluginLocalOptions).toConstantValue(pluginLocalOptions);
};
