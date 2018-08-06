/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { inject, injectable, named } from 'inversify';
import {
    PREFERENCES_CONTAINER_WIDGET_ID
} from './preferences-contribution';
import {
    ApplicationShell,
    PreferenceProvider,
    PreferenceScope,
    PreferenceService,
    WidgetFactory,
    WidgetManager
} from '@theia/core/lib/browser';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { PreferencesContainer } from './preferences-tree-widget';
import { MessageService } from '@theia/core';

@injectable()
export class PreferencesWidgetFactory implements WidgetFactory {

    readonly id = PREFERENCES_CONTAINER_WIDGET_ID;

    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(MessageService) protected readonly messageService: MessageService;

    constructor(@inject(WidgetManager) protected readonly widgetManager: WidgetManager,
                @inject(ApplicationShell) protected readonly shell: ApplicationShell,
                @inject(PreferenceProvider) @named(PreferenceScope.User) protected readonly userPreferenceProvider: UserPreferenceProvider,
                @inject(PreferenceProvider) @named(PreferenceScope.Workspace) protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider) {
    }

    async createWidget(): Promise<PreferencesContainer> {
        return new PreferencesContainer(this.widgetManager,
            this.shell,
            this.preferenceService,
            this.messageService,
            this.userPreferenceProvider,
            this.workspacePreferenceProvider);
    }
}
