import { TheiaPlugin } from '../../browser/application';
import { MainMenuFactory, MenuContribution } from './menu-plugin';
import { ContainerModule } from 'inversify';

export const electronMenuModule = new ContainerModule(bind => {
    bind(TheiaPlugin).to(MenuContribution);
    bind(MainMenuFactory).toSelf().inSingletonScope();
});
