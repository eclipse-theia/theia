
import { bindElectronBackend } from './hosted/node-electron/plugin-ext-hosted-electron-backend-module';
import { bindMainBackend } from './main/node/plugin-ext-backend-module';

export default new ContainerModule(bind => {
    bindMainBackend(bind);
    bindElectronBackend(bind);
});
