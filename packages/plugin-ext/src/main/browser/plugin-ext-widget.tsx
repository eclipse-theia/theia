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

import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { Message } from '@phosphor/messaging';
import { PluginMetadata } from '../../common/plugin-protocol';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { HostedPluginSupport, PluginProgressLocation } from '../../hosted/browser/hosted-plugin';
import { ProgressLocationService } from '@theia/core/lib/browser/progress-location-service';
import { ProgressBar } from '@theia/core/lib/browser/progress-bar';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

@injectable()
export class PluginWidget extends ReactWidget {

    @inject(HostedPluginSupport)
    protected readonly pluginService: HostedPluginSupport;

    @inject(ProgressLocationService)
    protected readonly progressLocationService: ProgressLocationService;

    constructor() {
        super();
        this.id = 'plugins';
        this.title.label = 'Plugins';
        this.title.caption = 'Plugins';
        this.title.iconClass = 'fa plugins-tab-icon';
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.addClass('theia-plugins');

        this.update();
    }

    @postConstruct()
    protected init(): void {
        this.toDispose.push(this.pluginService.onDidChangePlugins(() => this.update()));
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
    }

    protected readonly toDisposeProgress = new DisposableCollection();

    protected render(): React.ReactNode {
        return <div ref={ref => {
            this.toDisposeProgress.dispose();
            this.toDispose.push(this.toDisposeProgress);
            if (ref) {
                const onProgress = this.progressLocationService.onProgress(PluginProgressLocation);
                this.toDisposeProgress.push(new ProgressBar({ container: ref, insertMode: 'prepend' }, onProgress));
            }
        }}>{this.doRender()}</div>;
    }

    protected doRender(): React.ReactNode {
        const plugins = this.pluginService.plugins;
        if (!plugins.length) {
            return <AlertMessage type='INFO' header='No plugins currently available.' />;
        }
        return <React.Fragment>{this.renderPlugins(plugins)}</React.Fragment>;
    }

    protected renderPlugins(plugins: PluginMetadata[]): React.ReactNode {
        return <div id='pluginListContainer'>
            {plugins.map(plugin => this.renderPlugin(plugin))}
        </div>;
    }

    private renderPlugin(plugin: PluginMetadata): JSX.Element {
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
