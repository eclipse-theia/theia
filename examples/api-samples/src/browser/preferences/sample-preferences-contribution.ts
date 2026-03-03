// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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

import { CommandContribution, CommandRegistry, MessageService, QuickInputService } from '@theia/core';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { SampleBackendPreferencesService, sampleBackendPreferencesServicePath } from '../../common/preference-protocol';
import { ServiceConnectionProvider } from '@theia/core/lib/browser';

@injectable()
export class SamplePreferenceContribution implements CommandContribution {

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(SampleBackendPreferencesService)
    protected readonly preferencesService: SampleBackendPreferencesService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'samplePreferences.get', label: 'Get Backend Preference', category: 'API Samples' },
            {
                execute: async () => {
                    const key = await this.quickInputService.input({
                        title: 'Get Backend Preference',
                        prompt: 'Enter preference key'
                    });
                    if (key) {
                        const override = await this.quickInputService.input({
                            title: 'Get Backend Preference',
                            prompt: 'Enter override identifier'
                        });

                        const value = await this.preferencesService.getPreference(key, override);
                        this.messageService.info(`The value is \n${JSON.stringify(value)}`);
                    }
                }
            }
        );

        commands.registerCommand({ id: 'samplePreferences.inspect', label: 'Inspect Backend Preference', category: 'API Samples' },
            {
                execute: async () => {
                    const key = await this.quickInputService.input({
                        title: 'Inspect Backend Preference',
                        prompt: 'Enter preference key'
                    });
                    if (key) {
                        const override = await this.quickInputService.input({
                            title: 'Inspect Backend Preference',
                            prompt: 'Enter override identifier'
                        });

                        const value = await this.preferencesService.inspectPreference(key, override);
                        this.messageService.info(`The value is \n${JSON.stringify(value)}`);
                    }
                }
            }
        );

        commands.registerCommand({ id: 'samplePreferences.set', label: 'Set Backend Preference', category: 'API Samples' },
            {
                execute: async () => {
                    const key = await this.quickInputService.input({
                        title: 'Set Backend Preference',
                        prompt: 'Enter preference key'
                    });
                    if (key) {
                        const override = await this.quickInputService.input({
                            title: 'Set Backend Preference',
                            prompt: 'Enter override identifier'
                        });
                        const valueString = await this.quickInputService.input({
                            title: 'Set Backend Preference',
                            prompt: 'Enter JSON value'
                        });
                        if (valueString) {
                            await this.preferencesService.setPreference(key, override, JSON.parse(valueString));
                        }
                    }
                }
            }
        );
    }

}

export function bindSamplePreferenceContribution(bind: interfaces.Bind): void {
    bind(CommandContribution).to(SamplePreferenceContribution).inSingletonScope();
    bind(SampleBackendPreferencesService).toDynamicValue(ctx => ServiceConnectionProvider.createProxy(ctx.container, sampleBackendPreferencesServicePath)).inSingletonScope();
}
