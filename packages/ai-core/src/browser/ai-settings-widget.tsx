// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import { ContributionProvider, nls } from '@theia/core';
import { codicon, Panel, ReactWidget, StatefulWidget } from '@theia/core/lib/browser';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Agent } from '../common/';
import * as React from '@theia/core/shared/react';

@injectable()
export class AISettingsWidget extends ReactWidget implements StatefulWidget {

    static readonly ID = 'ai_settings_widget';
    static readonly LABEL = nls.localizeByDefault('AI Settings');

    protected readonly settingsWidget: Panel;

    @inject(ContributionProvider) @named(Agent)
    protected readonly agents: ContributionProvider<Agent>;


    @postConstruct()
    protected init(): void {
        this.id = AISettingsWidget.ID;
        this.title.label = AISettingsWidget.LABEL;
        this.title.closable = true;
        this.addClass('theia-settings-container');
        this.title.iconClass = codicon('hubot');

        this.update();
    }

    protected render(): React.ReactNode {
        return (
            <div>
                {this.renderAgentSettings()}
            </div >
        );
    }

    protected renderAgentSettings(): React.ReactNode {
        return null;
    }

    storeState(): object | undefined {
        // Implement the logic to store the state of the widget
        return {};
    }

    restoreState(oldState: object): void {
        // Implement the logic to restore the state of the widget
    }
}

