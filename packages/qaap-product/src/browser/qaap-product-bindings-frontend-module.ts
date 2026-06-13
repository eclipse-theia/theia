// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { AboutDialogProps } from '@theia/core/lib/browser/about-dialog';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { QaapBuiltinThemeBrandingContribution } from './qaap-builtin-theme-branding-contribution';
import { QaapCopilotDefaultsContribution } from './qaap-copilot-defaults-contribution';
import { QaapCorePreferenceBrandingContribution } from './qaap-core-preference-branding-contribution';
import { QaapMonacoEmbeddedLanguageContribution } from './qaap-monaco-embedded-language-contribution';
import { QaapPluginCompatibilityPreferenceContribution } from './qaap-plugin-compatibility-preference-contribution';
import { QaapTextmateRegistry } from './qaap-textmate-registry';
import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { TextmateRegistry } from '@theia/monaco/lib/browser/textmate/textmate-registry';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(QaapBuiltinThemeBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapBuiltinThemeBrandingContribution);

    bind(QaapCorePreferenceBrandingContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCorePreferenceBrandingContribution);

    bind(QaapCopilotDefaultsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapCopilotDefaultsContribution);

    bind(QaapPluginCompatibilityPreferenceContribution).toSelf().inSingletonScope();
    bind(PreferenceContribution).toService(QaapPluginCompatibilityPreferenceContribution);

    bind(QaapMonacoEmbeddedLanguageContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QaapMonacoEmbeddedLanguageContribution);

    bind(QaapTextmateRegistry).toSelf().inSingletonScope();
    rebind(TextmateRegistry).toService(QaapTextmateRegistry);

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
