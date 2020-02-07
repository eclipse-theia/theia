/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { PreferenceService, ContextMenuRenderer } from '@theia/core/lib/browser';
import { CommandService } from '@theia/core';
import { Preference, PreferencesCommands } from '../../util/preference-types';
import { PreferencesEventService } from '../../util/preference-event-service';
import { PreferenceScopeCommandManager } from '../../util/preference-scope-command-manager';
import { SinglePreferenceWrapper } from './single-preference-wrapper';

@injectable()
export class SinglePreferenceDisplayFactory {
    protected currentScope: Preference.SelectedScopeDetails = Preference.DEFAULT_SCOPE;
    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;
    @inject(PreferenceService) protected readonly preferenceValueRetrievalService: PreferenceService;
    @inject(PreferenceScopeCommandManager) protected readonly preferencesMenuFactory: PreferenceScopeCommandManager;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @postConstruct()
    init(): void {
        this.preferencesEventService.onTabScopeSelected.event(e => this.currentScope = e);
    }

    protected openJSON = (preferenceNode: Preference.NodeWithValueInAllScopes): void => {
        this.commandService.executeCommand(PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id, preferenceNode);
    };

    render(preferenceNode: Preference.NodeWithValueInAllScopes): React.ReactElement {
        return <SinglePreferenceWrapper
            contextMenuRenderer={this.contextMenuRenderer}
            preferenceDisplayNode={preferenceNode}
            currentScope={Number(this.currentScope.scope)}
            currentScopeURI={this.currentScope.uri}
            key={`${preferenceNode.id}-editor`}
            preferencesService={this.preferenceValueRetrievalService}
            openJSON={this.openJSON}
        />;
    }
}
