/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, named } from 'inversify';
import { ContributionProvider, CommandContribution, CommandRegistry } from '@theia/core/lib/common';
import { FrontendApplication, FrontendApplicationContribution, PreferenceSchema, PreferenceSchemaProvider } from '@theia/core/lib/browser';
import { LanguageClientContribution } from './language-client-contribution';

@injectable()
export class LanguagesFrontendContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(PreferenceSchemaProvider)
    protected preferenceSchema: PreferenceSchemaProvider;

    @inject(ContributionProvider) @named(LanguageClientContribution)
    protected readonly contributions: ContributionProvider<LanguageClientContribution>;

    onStart(app: FrontendApplication): void {
        const schema: PreferenceSchema = {
            type: 'object',
            properties: {}
        };
        for (const contribution of this.contributions.getContributions()) {
            contribution.waitForActivation(app).then(() =>
                contribution.activate(app)
            );
            schema.properties[`${contribution.id}.trace.server`] = {
                type: 'string',
                enum: [
                    'off',
                    'messages',
                    'verbose'
                ],
                default: 'off',
                description: `Enable/disable tracing communications with the ${contribution.name} language server`
            };
        }
        this.preferenceSchema.setSchema(schema);
    }

    registerCommands(commands: CommandRegistry): void {
        for (const contribution of this.contributions.getContributions()) {
            commands.registerCommand({
                id: `${contribution.id}.server.start`,
                label: `${contribution.name}: Start Language Server`
            }, {
                execute: () => contribution.activate(this.app),
                isEnabled: () => !contribution.running,
                isVisible: () => !contribution.running,
            });
            commands.registerCommand({
                id: `${contribution.id}.server.stop`,
                label: `${contribution.name}: Stop Language Server`
            }, {
                execute: () => contribution.deactivate(),
                isEnabled: () => contribution.running,
                isVisible: () => contribution.running,
            });
            commands.registerCommand({
                id: `${contribution.id}.server.restart`,
                label: `${contribution.name}: Restart Language Server`
            }, {
                execute: () => contribution.restart(),
                isEnabled: () => contribution.running,
                isVisible: () => contribution.running,
            });
        }
    }

}
