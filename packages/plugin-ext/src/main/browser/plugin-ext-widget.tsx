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

import { injectable, inject } from 'inversify';
import { Message } from '@phosphor/messaging';
import { DisposableCollection } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import { HostedPluginServer, PluginMetadata } from '../../common/plugin-protocol';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

@injectable()
export class PluginWidget extends ReactWidget {

    protected plugins: PluginMetadata[] = [];
    protected readonly toDisposeOnFetch = new DisposableCollection();
    protected readonly toDisposeOnSearch = new DisposableCollection();
    protected ready = false;

    constructor(
        @inject(HostedPluginServer) protected readonly hostedPluginServer: HostedPluginServer,
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) {
        super();
        this.id = 'plugins';
        this.title.label = 'Plugins';
        this.addClass('theia-plugins');

        this.update();
        this.fetchPlugins();
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        this.fetchPlugins();
        this.node.focus();
    }

    public refreshPlugins(): void {
        this.fetchPlugins();
    }

    protected fetchPlugins(): Promise<PluginMetadata[]> {
        const promise = this.hostedPluginServer.getDeployedMetadata();

        promise.then(pluginMetadatas => {
            this.plugins = pluginMetadatas;
            this.ready = true;
            this.update();
        });
        return promise;
    }

    protected render(): React.ReactNode {
        if (this.ready) {
            return <React.Fragment>{this.renderPluginList()}</React.Fragment>;
        } else {
            return <div className='spinnerContainer'>
                <div className='fa fa-spinner fa-pulse fa-3x fa-fw'></div>
            </div>;
        }
    }

    protected renderPluginList(): React.ReactNode {
        const theList: React.ReactNode[] = [];
        this.plugins.forEach(plugin => {
            const container = this.renderPlugin(plugin);
            theList.push(container);
        });

        return <div id='pluginListContainer'>
            {theList}
        </div>;
    }

    private renderPlugin(plugin: PluginMetadata) {
        return <div key={plugin.model.name} className={this.createPluginClassName(plugin)}>
            <div className='column flexcontainer pluginInformationContainer'>
                <div className='row flexcontainer'>
                    <div className='fa fa-puzzle-piece fa-2x fa-fw'></div>
                    <div title={plugin.model.name} className='pluginName noWrapInfo'>{plugin.model.name}</div>
                </div>
                <div className='row flexcontainer'>
                    <div className='pluginVersion'>{plugin.model.version}</div>
                </div>
                <div className='row flexcontainer'>
                    <div className='pluginDescription noWrapInfo'>{plugin.model.description}</div>
                </div>
                <div className='row flexcontainer'>
                    <div className='pluginPublisher noWrapInfo flexcontainer'>{plugin.model.publisher}</div>
                </div>
            </div>
        </div>;
    }

    protected createPluginClassName(plugin: PluginMetadata): string {
        const classNames = ['pluginHeaderContainer'];
        return classNames.join(' ');
    }
}
