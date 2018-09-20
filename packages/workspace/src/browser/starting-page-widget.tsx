/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import React = require('react');
import { injectable, inject, postConstruct } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { WorkspaceService } from './workspace-service';
import { FileStat, FileSystem, FileSystemUtils } from '@theia/filesystem/lib/common';
import URI from '@theia/core/lib/common/uri';
import { CommandRegistry } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { WorkspaceCommands } from './workspace-commands';

@injectable()
export class StartingPageWidget extends ReactWidget {

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    static readonly ID = 'starting.page.widget';

    protected homeStat: FileStat | undefined;

    protected home: string | undefined;

    protected readonly recentLimit = 5;

    protected recentWorkspaces: string[];

    constructor() {
        super();
        this.id = StartingPageWidget.ID;
        this.title.label = 'Getting Started';
        this.title.closable = true;
        this.update();
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.recentWorkspaces = await this.workspaceService.recentWorkspaces();
        this.homeStat = await this.fileSystem.getCurrentUserHome();
        this.home = (this.homeStat) ? new URI(this.homeStat.uri).withoutScheme().toString() : undefined;
        this.update();
    }

    render(): React.ReactNode {
        return <div className='starting-page-widget-container'>
            <div className='starting-page-container'>
                <h1>Theia <span className='starting-page-message'>Getting Started</span></h1>
            </div>
            <hr className='starting-page-hr' />
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderOpen()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {(this.recentWorkspaces) ? this.renderRecentWorkspaces() : ''}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderSettings()}
                </div>
            </div>
        </div>;
    }

    protected renderOpen(): React.ReactNode {
        return <div className='starting-page-sub-container'>
            <div className='starting-page-header'>
                <h3><i className='fa fa-folder-open'></i>Open</h3>
            </div>
            <div className='action-item-container'>
                <a className='action-item' href='#' onClick={this.openFolder}>Open...</a>
            </div>
            <div className='action-item-container'>
                <a className='action-item' href='#' onClick={this.openWorkspace}>Open Workspace...</a>
            </div>
        </div>;
    }

    protected renderRecentWorkspaces(): React.ReactNode {
        const items = this.recentWorkspaces;
        const paths = this.buildPaths(items);
        const content = paths.slice(0, this.recentLimit).map((item, index) =>
            <div className='action-item-container' key={index}>
                <a className='action-item' href='#' onClick={a => this.open(new URI(items[index]))}>{new URI(items[index]).path.base}</a>
                <span className='action-item-details'>
                    {item}
                </span>
            </div>
        );
        const more = (paths.length > this.recentLimit) ? <div className='action-item-container'>
            <a className='action-item' href='#' onClick={this.openRecentWorkspaces}>More...</a>
        </div> : <div />;
        return <div className='starting-page-sub-container'>
            <div className='starting-page-header'>
                <h3><i className='fa fa-clock-o'></i>Recent Workspaces</h3>
            </div>
            {content}
            {more}
        </div>;
    }

    protected renderSettings(): React.ReactNode {
        return <div className='starting-page-sub-container'>
            <div className='starting-page-header'>
                <h3><i className='fa fa-cog'></i>Settings</h3>
            </div>
            <div className='action-item-container'>
                <a className='action-item' href='#' onClick={this.openPreferences}>Open Preferences</a>
            </div>
            <div className='action-item-container'>
                <a className='action-item' href='#' onClick={this.openKeyboardShortcuts}>Open Keyboard Shortcuts</a>
            </div>
        </div>;
    }

    protected openFolder = () => {
        this.commandRegistry.executeCommand(WorkspaceCommands.OPEN.id);
    }

    protected openWorkspace = () => {
        this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_WORKSPACE.id);
    }

    protected openRecentWorkspaces = () => {
        this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE.id);
    }

    protected openPreferences = () => {
        this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
    }

    protected openKeyboardShortcuts = () => {
        this.commandRegistry.executeCommand(CommonCommands.OPEN_KEYMAPS.id);
    }

    protected buildPaths(workspaces: string[]): string[] {
        const paths: string[] = [];
        workspaces.forEach(workspace => {
            const uri = new URI(workspace);
            const path = (this.home) ? FileSystemUtils.tildifyPath(uri.path.toString(), this.home) : uri.path.toString();
            paths.push(path);
        });
        return paths;
    }

    protected open = (workspace: URI) => {
        this.workspaceService.open(workspace);
    }
}
