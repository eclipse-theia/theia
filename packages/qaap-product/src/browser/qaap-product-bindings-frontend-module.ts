// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AboutDialogProps } from '@theia/core/lib/browser/about-dialog';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { QaapBuiltinThemeBrandingContribution } from './qaap-builtin-theme-branding-contribution';
import { QaapCorePreferenceBrandingContribution } from './qaap-core-preference-branding-contribution';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(QaapBuiltinThemeBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapBuiltinThemeBrandingContribution);

    bind(QaapCorePreferenceBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCorePreferenceBrandingContribution);

    if (isBound(AboutDialogProps)) {
        rebind(AboutDialogProps).toDynamicValue(() => ({
            title: FrontendApplicationConfigProvider.get().applicationName
        })).inSingletonScope();
    } else {
        bind(AboutDialogProps).toDynamicValue(() => ({
            title: FrontendApplicationConfigProvider.get().applicationName
        })).inSingletonScope();
    }
});
