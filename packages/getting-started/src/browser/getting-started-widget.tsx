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

import * as React from 'react';
import URI from '@theia/core/lib/common/uri';
import { injectable, inject, postConstruct } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandRegistry, isOSX, environment } from '@theia/core/lib/common';
import { WorkspaceCommands, WorkspaceService } from '@theia/workspace/lib/browser';
import { FileStat, FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { FileSystemUtils } from '@theia/filesystem/lib/common/filesystem-utils';
import { KeymapsCommands } from '@theia/keymaps/lib/browser';
import { CommonCommands } from '@theia/core/lib/browser';
import { ApplicationInfo, ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';

@injectable()
export class GettingStartedWidget extends ReactWidget {

    static readonly ID = 'getting.started.widget';
    static readonly LABEL = 'Getting Started';

    protected applicationInfo: ApplicationInfo | undefined;
    protected applicationName = FrontendApplicationConfigProvider.get().applicationName;

    protected stat: FileStat | undefined;
    protected home: string | undefined;

    protected readonly recentLimit = 5;
    protected recentWorkspaces: string[] = [];

    protected readonly documentationUrl = 'https://www.theia-ide.org/doc/';
    protected readonly extensionUrl = 'https://www.theia-ide.org/doc/Authoring_Extensions.html';
    protected readonly pluginUrl = 'https://www.theia-ide.org/doc/Authoring_Plugins.html';

    @inject(ApplicationServer)
    protected readonly appServer: ApplicationServer;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected async init(): Promise<void> {
        this.id = GettingStartedWidget.ID;
        this.title.label = GettingStartedWidget.LABEL;
        this.title.caption = GettingStartedWidget.LABEL;
        this.title.closable = true;

        this.applicationInfo = await this.appServer.getApplicationInfo();
        this.recentWorkspaces = await this.workspaceService.recentWorkspaces();
        this.stat = await this.fileSystem.getCurrentUserHome();
        this.home = (this.stat) ? new URI(this.stat.uri).withoutScheme().toString() : undefined;
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='gs-container'>
            {this.renderHeader()}
            <hr className='gs-hr' />
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderOpen()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderRecentWorkspaces()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderSettings()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderHelp()}
                </div>
            </div>
            <div className='flex-grid'>
                <div className='col'>
                    {this.renderVersion()}
                </div>
            </div>
        </div>;
    }

    protected renderHeader(): React.ReactNode {
        return <div className='gs-header'>
            <div id='getting-started-logo'></div>
            <h1>{this.applicationName}<span className='gs-sub-header'> Getting Started</span></h1>
        </div>;
    }

    protected renderOpen(): React.ReactNode {
        const requireSingleOpen = isOSX || !environment.electron.is();
        const open = (requireSingleOpen) ? <div className='gs-action-container'><a href='#' onClick={this.doOpen}>Open</a></div> : '';
        const openFile = (!requireSingleOpen) ? <div className='gs-action-container'><a href='#' onClick={this.doOpenFile}>Open File</a></div> : '';
        const openFolder = (!requireSingleOpen) ? <div className='gs-action-container'><a href='#' onClick={this.doOpenFolder}>Open Folder</a></div> : '';
        const openWorkspace = <a href='#' onClick={this.doOpenWorkspace}>Open Workspace</a>;
        return <div className='gs-section'>
            <h3 className='gs-section-header'><i className='fa fa-folder-open'></i>Open</h3>
            {open}
            {openFile}
            {openFolder}
            {openWorkspace}
        </div>;
    }

    protected renderRecentWorkspaces(): React.ReactNode {
        const items = this.recentWorkspaces;
        const paths = this.buildPaths(items);
        const content = paths.slice(0, this.recentLimit).map((item, index) =>
            <div className='gs-action-container' key={index}>
                <a href='#' onClick={a => this.open(new URI(items[index]))}>{new URI(items[index]).path.base}</a>
                <span className='gs-action-details'>
                    {item}
                </span>
            </div>
        );
        const more = (paths.length > this.recentLimit) ? <div className='gs-action-container'>
            <a href='#' onClick={this.doOpenRecentWorkspace}>More...</a>
        </div> : <div />;
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className='fa fa-clock-o'></i>Recent Workspaces
            </h3>
            {(items.length > 0) ? content : <p className='gs-no-recent'>No Recent Workspaces</p>}
            {more}
        </div>;
    }

    protected renderSettings(): React.ReactNode {
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className='fa fa-cog'></i>
                Settings
            </h3>
            <div className='gs-action-container'>
                <a href='#' onClick={this.doOpenPreferences}>Open Preferences</a>
            </div>
            <div className='gs-action-container'>
                <a href='#' onClick={this.doOpenKeyboardShortcuts}>Open Keyboard Shortcuts</a>
            </div>
        </div>;
    }

    protected renderHelp(): React.ReactNode {
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className='fa fa-question-circle'></i>
                Help
            </h3>
            <div className='gs-action-container'>
                <a href={this.documentationUrl} target='_blank'>Documentation</a>
            </div>
            <div className='gs-action-container'>
                <a href={this.extensionUrl} target='_blank'>Building a New Extension</a>
            </div>
            <div className='gs-action-container'>
                <a href={this.pluginUrl} target='_blank'>Building a New Plugin</a>
            </div>
        </div>;
    }

    protected renderVersion(): React.ReactNode {
        return <div className='gs-section'>
            <div className='gs-action-container'>
                <p className='gs-sub-header' >
                    {this.applicationInfo ? 'Version ' + this.applicationInfo.version : ''}
                </p>
            </div>
        </div>;
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

    protected doOpen = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN.id);
    protected doOpenFile = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_FILE.id);
    protected doOpenFolder = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_FOLDER.id);
    protected doOpenWorkspace = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_WORKSPACE.id);
    protected doOpenRecentWorkspace = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE.id);
    protected doOpenPreferences = () => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
    protected doOpenKeyboardShortcuts = () => this.commandRegistry.executeCommand(KeymapsCommands.OPEN_KEYMAPS.id);
    protected open = (workspace: URI) => this.workspaceService.open(workspace);
}
