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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ReactWidget, QuickInputService } from '@theia/core/lib/browser';
import { CommandRegistry, Disposable, DisposableCollection, MessageService } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { DebugConsoleContribution } from '../console/debug-console-contribution';
import { DebugConfigurationManager } from '../debug-configuration-manager';
import { DebugCommands } from '../debug-frontend-application-contribution';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugAction } from './debug-action';
import { DebugConfigurationSelect } from './debug-configuration-select';
import { DebugViewModel } from './debug-view-model';
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

    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly onRender = new DisposableCollection();

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
    protected setStepRef = (stepRef: DebugAction | null) => {
        this.stepRef = stepRef || undefined;
        this.onRender.dispose();
    };

    render(): React.ReactNode {
        return <React.Fragment>
            <DebugAction run={this.start} label={nls.localizeByDefault('Start Debugging')} iconClass='debug-start' ref={this.setStepRef} />
            <DebugConfigurationSelect
                manager={this.manager}
                quickInputService={this.quickInputService}
                isMultiRoot={this.workspaceService.isMultiRootWorkspaceOpened}
            />
            <DebugAction run={this.openConfiguration} label={nls.localizeByDefault('Open {0}', '"launch.json"')}
                iconClass='settings-gear' />
            <DebugAction run={this.openConsole} label={nls.localizeByDefault('Debug Console')} iconClass='terminal' />
        </React.Fragment>;
    }

    protected readonly start = async () => {
        let configuration;
        try {
            configuration = await this.manager.getSelectedConfiguration();
        } catch (e) {
            this.messageService.error(e.message);
            return;
        }

        this.commandRegistry.executeCommand(DebugCommands.START.id, configuration);
    };

    protected readonly openConfiguration = () => this.manager.openConfiguration();
    protected readonly openConsole = () => this.debugConsole.openView({
        activate: true
    });

}
