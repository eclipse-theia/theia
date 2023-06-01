// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from 'inversify';
import { PreloadContribution, Preloader } from './preloader';
import { bindContributionProvider } from '../../common/contribution-provider';
import { I18nPreloadContribution } from './i18n-preload-contribution';
import { OSPreloadContribution } from './os-preload-contribution';
import { ThemePreloadContribution } from './theme-preload-contribution';

export default new ContainerModule(bind => {
    bind(Preloader).toSelf().inSingletonScope();
    bindContributionProvider(bind, PreloadContribution);

    bind(I18nPreloadContribution).toSelf().inSingletonScope();
    bind(PreloadContribution).toService(I18nPreloadContribution);
    bind(OSPreloadContribution).toSelf().inSingletonScope();
    bind(PreloadContribution).toService(OSPreloadContribution);
    bind(ThemePreloadContribution).toSelf().inSingletonScope();
    bind(PreloadContribution).toService(ThemePreloadContribution);
});
