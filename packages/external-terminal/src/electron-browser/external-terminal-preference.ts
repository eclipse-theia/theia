// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import { inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { PreferenceSchema, PreferenceProxy } from '@theia/core/lib/browser';
import { PreferenceProxyFactory } from '@theia/core/lib/browser/preferences/injectable-preference-proxy';
import { PreferenceSchemaProvider } from '@theia/core/lib/browser/preferences/preference-contribution';
import { isWindows, isOSX } from '@theia/core/lib/common/os';
import { ExternalTerminalService, ExternalTerminalConfiguration } from '../common/external-terminal';
import { nls } from '@theia/core/lib/common/nls';

export const ExternalTerminalPreferences = Symbol('ExternalTerminalPreferences');
export type ExternalTerminalPreferences = PreferenceProxy<ExternalTerminalConfiguration>;

export const ExternalTerminalSchemaProvider = Symbol('ExternalTerminalSchemaPromise');
export type ExternalTerminalSchemaProvider = () => Promise<PreferenceSchema>;

export function bindExternalTerminalPreferences(bind: interfaces.Bind): void {
    bind(ExternalTerminalPreferenceService).toSelf().inSingletonScope();
    bind(ExternalTerminalSchemaProvider)
        .toProvider(ctx => {
            const schema = getExternalTerminalSchema(ctx.container.get(ExternalTerminalService));
            return () => schema;
        });
    bind(ExternalTerminalPreferences)
        .toDynamicValue(ctx => {
            const factory = ctx.container.get<PreferenceProxyFactory>(PreferenceProxyFactory);
            const schemaProvider = ctx.container.get<ExternalTerminalSchemaProvider>(ExternalTerminalSchemaProvider);
            return factory(schemaProvider());
        })
        .inSingletonScope();
}

@injectable()
export class ExternalTerminalPreferenceService {

    @inject(ExternalTerminalPreferences)
    protected readonly preferences: ExternalTerminalPreferences;

    @inject(PreferenceSchemaProvider)
    protected readonly preferenceSchemaProvider: PreferenceSchemaProvider;

    @inject(ExternalTerminalSchemaProvider)
    protected readonly promisedSchema: ExternalTerminalSchemaProvider;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.preferenceSchemaProvider.setSchema(await this.promisedSchema());
    }

    /**
     * Get the external terminal configurations from preferences.
     */
    getExternalTerminalConfiguration(): ExternalTerminalConfiguration {
        return {
            'terminal.external.linuxExec': this.preferences['terminal.external.linuxExec'],
            'terminal.external.osxExec': this.preferences['terminal.external.osxExec'],
            'terminal.external.windowsExec': this.preferences['terminal.external.windowsExec'],
        };
    }
}

/**
 * Use the backend {@link ExternalTerminalService} to establish the schema for the `ExternalTerminalPreferences`.
 *
 * @param externalTerminalService the external terminal backend service.
 * @returns a preference schema with the OS default exec set by the backend service.
 */
export async function getExternalTerminalSchema(externalTerminalService: ExternalTerminalService): Promise<PreferenceSchema> {
    const hostExec = await externalTerminalService.getDefaultExec();
    return {
        type: 'object',
        properties: {
            'terminal.external.windowsExec': {
                type: 'string',
                typeDetails: { isFilepath: true },
                description: nls.localizeByDefault('Customizes which terminal to run on Windows.'),
                default: `${isWindows ? hostExec : 'C:\\WINDOWS\\System32\\cmd.exe'}`
            },
            'terminal.external.osxExec': {
                type: 'string',
                description: nls.localizeByDefault('Customizes which terminal application to run on macOS.'),
                default: `${isOSX ? hostExec : 'Terminal.app'}`
            },
            'terminal.external.linuxExec': {
                type: 'string',
                description: nls.localizeByDefault('Customizes which terminal to run on Linux.'),
                default: `${!(isWindows || isOSX) ? hostExec : 'xterm'}`
            }
        }
    };
}
