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

import { injectable, postConstruct, inject } from 'inversify';
import { BaseWidget } from '@theia/core/lib/browser';
import { Message } from '@phosphor/messaging';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DebugConfigurationManager } from '../debug-configuration';
import { DebugSessionManager } from '../debug-session';
import { DebugSession } from '../debug-model';
import { DebugConfiguration, DebugService } from '../../common/debug-common';
import { DebugPanelHandler } from '../view/debug-panel-widget';

/**
 * Manages debug configurations.
 */
@injectable()
export class DebugExplorerWidget extends BaseWidget {
    protected container: HTMLElement;
    protected configNodes: React.ReactNode[] = [];

    constructor(
        @inject(DebugConfigurationManager) protected readonly debugConfiguration: DebugConfigurationManager,
        @inject(DebugSessionManager) protected readonly debugSessionManager: DebugSessionManager,
        @inject(DebugService) protected readonly debug: DebugService,
        @inject(DebugPanelHandler) protected readonly debugPanelHandler: DebugPanelHandler) {

        super();
        this.id = 'theia-debug-explorer';
        this.title.label = 'Debug Explorer';
        this.title.caption = 'Debug Explorer';
        this.title.iconClass = 'fa debug-tab-icon';
        this.addClass('theia-debug-explorer');
    }

    @postConstruct()
    protected init() {
        this.container = document.createElement('div');
        this.node.appendChild(this.container);

        this.updateConfigurations();

        this.debugSessionManager.onDidCreateDebugSession(() => this.updateConfigurations());
        this.debugSessionManager.onDidDestroyDebugSession(() => this.updateConfigurations());
        this.debugConfiguration.onDidConfigurationChanged(() => this.updateConfigurations());
    }

    protected onUpdateRequest(msg: Message) {
        super.onUpdateRequest(msg);
        ReactDOM.render(<React.Fragment>{this.renderHeader()}{this.renderConfigurations()}</React.Fragment>, this.container);
    }

    protected renderHeader(): React.ReactNode {
        const openConfigurationHandler = () => this.debugConfiguration.openConfigurationFile();
        const addConfigurationHandler = () => this.debugConfiguration.addConfiguration();

        return <div className='header-container'>
            <div className='header'>Debug Configurations</div>
            <div className='button-container'>
                <span className='btn fa fa-plus enabled' onClick={addConfigurationHandler} title='Add configuration'></span>
                <span className='btn fa fa-cogs enabled' onClick={openConfigurationHandler} title='Configure'></span>
            </div>
        </div>;
    }

    protected renderConfigurations(): React.ReactNode {
        return <div>{this.configNodes}</div>;
    }

    protected async updateConfigurations(): Promise<void> {
        this.configNodes = [];

        const sessions = this.debugSessionManager.findAll();
        for (const session of sessions) {
            this.proceedConfiguration(session.configuration, session);
        }

        const configurations = await this.debugConfiguration.readConfigurations();
        for (const config of configurations) {
            this.proceedConfiguration(config);
        }

        this.update();
    }

    private proceedConfiguration(configuration: DebugConfiguration, session?: DebugSession): void {
        const startHandler = () => this.startDebugSession(configuration);
        const stopHandler = () => {
            if (session) {
                this.stopDebugSession(session);
            }
        };
        const openDebugPanelHandler = () => {
            if (session) {
                this.debugPanelHandler.createOrActiveDebugPanel(session);
            }
        };

        const startEnabled = session ? '' : 'enabled';
        const stopEnabled = session ? 'enabled' : '';

        this.configNodes.push(<div className='configuration-container' onDoubleClick={openDebugPanelHandler}>
            <div className='configuration'>{configuration.name}</div>
            <div className='button-container'>
                <span className={`btn fa fa-stop ${stopEnabled}`} onClick={stopHandler} title='Stop'></span>
                <span className={`btn fa fa-play ${startEnabled}`} onClick={startHandler} title='Start'></span>
            </div>
            <div className='clear-float'></div>
        </div>);
    }

    private async startDebugSession(configuration: DebugConfiguration): Promise<void> {
        const resolvedConfiguration = await this.debugConfiguration.resolveDebugConfiguration(configuration);
        if (!resolvedConfiguration) {
            return;
        }

        const session = await this.debug.create(resolvedConfiguration);
        await this.debugSessionManager.create(session, resolvedConfiguration);
    }

    private async stopDebugSession(session: DebugSession): Promise<void> {
        await session.disconnect();
    }
}
