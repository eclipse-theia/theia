/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import { Disposable } from '@theia/core/lib/common';
import { ReactWidget } from '@theia/core/lib/browser';
import { DebugConsoleContribution } from '../console/debug-console-contribution';
import { DebugConfigurationManager } from '../debug-configuration-manager';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugAction } from './debug-action';
import { DebugViewModel } from './debug-view-model';

@injectable()
export class DebugConfigurationWidget extends ReactWidget {

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugConfigurationManager)
    protected readonly manager: DebugConfigurationManager;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    @inject(DebugConsoleContribution)
    protected readonly debugConsole: DebugConsoleContribution;

    @postConstruct()
    protected init(): void {
        this.addClass('debug-toolbar');
        this.toDispose.push(this.manager.onDidChange(() => this.update()));
        this.update();
    }

    focus(): void {
        if (!this.doFocus()) {
            this.onRender.push(Disposable.create(() => this.doFocus()));
            this.update();
        }
    }
    protected doFocus(): boolean {
        if (!this.stepRef) {
            return false;
        }
        this.stepRef.focus();
        return true;
    }
    protected stepRef: DebugAction | undefined;
    protected setStepRef = (stepRef: DebugAction | null) => this.stepRef = stepRef || undefined;

    render(): React.ReactNode {
        const { configurations, currentConfiguration } = this.manager;
        return <React.Fragment>
            <DebugAction run={this.start} label='Start Debugging' iconClass='start' ref={this.setStepRef} />
            <select className='debug-configuration' value={currentConfiguration && currentConfiguration.name} onChange={this.setCurrentConfiguration}>
                {Array.from(configurations).map((configuration, index) =>
                    <option key={index} value={configuration.name}>{configuration.name}</option>
                )}
            </select>
            <DebugAction run={this.openConfiguration} label='Open launch.json' iconClass='configure' />
            <DebugAction run={this.openConsole} label='Debug Console' iconClass='repl' />
        </React.Fragment>;
    }

    protected readonly setCurrentConfiguration = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        this.manager.currentConfiguration = this.manager.findConfiguration(value);
    }

    protected readonly start = () => {
        const configuration = this.manager.currentConfiguration;
        if (configuration) {
            this.sessionManager.start(configuration);
        }
    }

    protected readonly openConfiguration = () => this.manager.openConfiguration();
    protected readonly openConsole = () => this.debugConsole.openView({
        activate: true
    })

}
