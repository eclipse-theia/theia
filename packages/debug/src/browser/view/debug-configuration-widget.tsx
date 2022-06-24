// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry, Disposable } from '@theia/core/lib/common';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import URI from '@theia/core/lib/common/uri';
import { ReactWidget } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { DebugConsoleContribution } from '../console/debug-console-contribution';
import { DebugConfigurationManager } from '../debug-configuration-manager';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugAction } from './debug-action';
import { DebugViewModel } from './debug-view-model';
import { DebugSessionOptions } from '../debug-session-options';
import { DebugCommands } from '../debug-frontend-application-contribution';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class DebugConfigurationWidget extends ReactWidget {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(DebugViewModel)
    protected readonly viewModel: DebugViewModel;

    @inject(DebugConfigurationManager)
    protected readonly manager: DebugConfigurationManager;

    @inject(DebugSessionManager)
    protected readonly sessionManager: DebugSessionManager;

    @inject(DebugConsoleContribution)
    protected readonly debugConsole: DebugConsoleContribution;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.addClass('debug-toolbar');
        this.toDispose.push(this.manager.onDidChange(() => this.update()));
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => this.update()));
        this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => this.update()));
        this.scrollOptions = undefined;
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
        const { options } = this;
        return <React.Fragment>
            <DebugAction run={this.start} label={nls.localizeByDefault('Start Debugging')} iconClass='debug-start' ref={this.setStepRef} />
            <SelectComponent options={options} value={this.currentValue} onChange={option => this.setCurrentConfiguration(option)} />
            <DebugAction run={this.openConfiguration} label={nls.localizeByDefault('Open {0}', '"launch.json"')}
                iconClass='settings-gear' />
            <DebugAction run={this.openConsole} label={nls.localizeByDefault('Debug Console')} iconClass='terminal' />
        </React.Fragment>;
    }
    protected get currentValue(): string {
        const { current } = this.manager;
        return current ? this.toValue(current) : '__NO_CONF__';
    }
    protected get options(): SelectOption[] {
        const items: SelectOption[] = Array.from(this.manager.all).map(option => ({
            value: this.toValue(option),
            label: this.toName(option)
        }));
        if (items.length === 0) {
            items.push({
                value: '__NO_CONF__',
                label: nls.localizeByDefault('No Configurations')
            });
        }
        items.push({
            separator: true
        });
        items.push({
            value: '__ADD_CONF__',
            label: nls.localizeByDefault('Add Configuration...')
        });
        return items;
    }
    protected toValue({ configuration, workspaceFolderUri }: DebugSessionOptions): string {
        if (!workspaceFolderUri) {
            return configuration.name;
        }
        return configuration.name + '__CONF__' + workspaceFolderUri;
    }
    protected toName({ configuration, workspaceFolderUri }: DebugSessionOptions): string {
        if (!workspaceFolderUri || !this.workspaceService.isMultiRootWorkspaceOpened) {
            return configuration.name;
        }
        return configuration.name + ' (' + new URI(workspaceFolderUri).path.base + ')';
    }

    protected readonly setCurrentConfiguration = (option: SelectOption) => {
        const value = option.value!;
        if (value === '__ADD_CONF__') {
            this.manager.addConfiguration();
        } else {
            const [name, workspaceFolderUri] = value.split('__CONF__');
            this.manager.current = this.manager.find(name, workspaceFolderUri);
        }
    };

    protected readonly start = () => {
        const configuration = this.manager.current;
        this.commandRegistry.executeCommand(DebugCommands.START.id, configuration);
    };

    protected readonly openConfiguration = () => this.manager.openConfiguration();
    protected readonly openConsole = () => this.debugConsole.openView({
        activate: true
    });

}
