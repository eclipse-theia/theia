import { interfaces } from '@theia/core/shared/inversify';
import { PluginLocalOptions } from '@theia/plugin-ext/lib/hosted/browser-only/frontend-hosted-plugin-server';
import { mockData } from './mock-plugin-metadata';


export const bindPluginInitialization = (bind: interfaces.Bind, rebind: interfaces.Rebind): void => {
    const pluginLocalOptions = {
        pluginDirectory: '',
        pluginMetadata: mockData,
    };
    bind(PluginLocalOptions).toConstantValue(pluginLocalOptions);
};
