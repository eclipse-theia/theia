// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { codicon, CommonCommands, Key, KeyCode, LabelProvider, Message, PreferenceService, ReactWidget } from '@theia/core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CommandRegistry, environment, isOSX, Path } from '@theia/core/lib/common';
import { ApplicationInfo, ApplicationServer } from '@theia/core/lib/common/application-protocol';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { nls } from '@theia/core/lib/common/nls';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { KeymapsCommands } from '@theia/keymaps/lib/browser';
import { WorkspaceCommands, WorkspaceService } from '@theia/workspace/lib/browser';

/**
 * Default implementation of the `GettingStartedWidget`.
 * The widget is displayed when there are currently no workspaces present.
 * Some of the features displayed include:
 * - `open` commands.
 * - `recently used workspaces`.
 * - `settings` commands.
 * - `help` commands.
 * - helpful links.
 */
@injectable()
export class GettingStartedWidget extends ReactWidget {

    /**
     * The widget `id`.
     */
    static readonly ID = 'getting.started.widget';
    /**
     * The widget `label` which is used for display purposes.
     */
    static readonly LABEL = nls.localizeByDefault('Welcome');

    /**
     * The `ApplicationInfo` for the application if available.
     * Used in order to obtain the version number of the application.
     */
    protected applicationInfo: ApplicationInfo | undefined;
    /**
     * The application name which is used for display purposes.
     */
    protected applicationName = FrontendApplicationConfigProvider.get().applicationName;

    protected home: string | undefined;

    /**
     * The recently used workspaces limit.
     * Used in order to limit the number of recently used workspaces to display.
     */
    protected recentLimit = 5;
    /**
     * The list of recently used workspaces.
     */
    protected recentWorkspaces: string[] = [];

    /**
     * Indicates whether the "ai-core" extension is available.
     */
    protected aiIsIncluded: boolean;

    /**
     * Collection of useful links to display for end users.
     */
    protected readonly documentationUrl = 'https://www.theia-ide.org/docs/';
    protected readonly compatibilityUrl = 'https://eclipse-theia.github.io/vscode-theia-comparator/status.html';
    protected readonly extensionUrl = 'https://www.theia-ide.org/docs/authoring_extensions';
    protected readonly pluginUrl = 'https://www.theia-ide.org/docs/authoring_plugins';
    protected readonly userAIDocUrl = 'https://theia-ide.org/docs/user_ai/';
    protected readonly theiaAIDocUrl = 'https://theia-ide.org/docs/theia_ai/';
    protected readonly ghProjectUrl = 'https://github.com/eclipse-theia/theia/issues/new/choose';

    @inject(ApplicationServer)
    protected readonly appServer: ApplicationServer;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        this.id = GettingStartedWidget.ID;
        this.title.label = GettingStartedWidget.LABEL;
        this.title.caption = GettingStartedWidget.LABEL;
        this.title.closable = true;

        this.applicationInfo = await this.appServer.getApplicationInfo();
        this.recentWorkspaces = await this.workspaceService.recentWorkspaces();
        this.home = new URI(await this.environments.getHomeDirUri()).path.toString();

        const extensions = await this.appServer.getExtensionsInfos();
        this.aiIsIncluded = extensions.find(ext => ext.name === '@theia/ai-core') !== undefined;
        this.update();
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const elArr = this.node.getElementsByTagName('a');
        if (elArr && elArr.length > 0) {
            (elArr[0] as HTMLElement).focus();
        }
    }

    /**
     * Render the content of the widget.
     */
    protected render(): React.ReactNode {
        return <div className='gs-container'>
            <div className='gs-content-container'>
                {this.aiIsIncluded &&
                    <div className='gs-float shadow-pulse'>
                        {this.renderAIBanner()}
                    </div>
                }
                {this.renderHeader()}
                <hr className='gs-hr' />
                {this.aiIsIncluded &&
                    <div className='flex-grid'>
                        <div className='col'>
                            {this.renderNews()}
                        </div>
                    </div>
                }
                <div className='flex-grid'>
                    <div className='col'>
                        {this.renderStart()}
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
            </div>
            <div className='gs-preference-container'>
                {this.renderPreferences()}
            </div>
        </div>;
    }

    /**
     * Render the widget header.
     * Renders the title `{applicationName} Getting Started`.
     */
    protected renderHeader(): React.ReactNode {
        return <div className='gs-header'>
            <h1>{this.applicationName}<span className='gs-sub-header'>{' ' + GettingStartedWidget.LABEL}</span></h1>
        </div>;
    }

    /**
     * Render the `Start` section.
     * Displays a collection of "start-to-work" related commands like `open` commands and some other.
     */
    protected renderStart(): React.ReactNode {
        const requireSingleOpen = isOSX || !environment.electron.is();

        const createFile = <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doCreateFile}
                onKeyDown={this.doCreateFileEnter}>
                {nls.localizeByDefault('New File...')}
            </a>
        </div>;

        const open = requireSingleOpen && <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpen}
                onKeyDown={this.doOpenEnter}>
                {nls.localizeByDefault('Open')}
            </a>
        </div>;

        const openFile = !requireSingleOpen && <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpenFile}
                onKeyDown={this.doOpenFileEnter}>
                {nls.localizeByDefault('Open File')}
            </a>
        </div>;

        const openFolder = !requireSingleOpen && <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpenFolder}
                onKeyDown={this.doOpenFolderEnter}>
                {nls.localizeByDefault('Open Folder')}
            </a>
        </div>;

        const openWorkspace = (
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpenWorkspace}
                onKeyDown={this.doOpenWorkspaceEnter}>
                {nls.localizeByDefault('Open Workspace')}
            </a>
        );

        return <div className='gs-section'>
            <h3 className='gs-section-header'><i className={codicon('folder-opened')}></i>{nls.localizeByDefault('Start')}</h3>
            {createFile}
            {open}
            {openFile}
            {openFolder}
            {openWorkspace}
        </div>;
    }

    /**
     * Render the recently used workspaces section.
     */
    protected renderRecentWorkspaces(): React.ReactNode {
        const items = this.recentWorkspaces;
        const paths = this.buildPaths(items);
        const content = paths.slice(0, this.recentLimit).map((item, index) =>
            <div className='gs-action-container' key={index}>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={() => this.open(new URI(items[index]))}
                    onKeyDown={(e: React.KeyboardEvent) => this.openEnter(e, new URI(items[index]))}>
                    {this.labelProvider.getName(new URI(items[index]))}
                </a>
                <span className='gs-action-details'>
                    {item}
                </span>
            </div>
        );
        // If the recently used workspaces list exceeds the limit, display `More...` which triggers the recently used workspaces quick-open menu upon selection.
        const more = paths.length > this.recentLimit && <div className='gs-action-container'>
            <a
                role={'button'}
                tabIndex={0}
                onClick={this.doOpenRecentWorkspace}
                onKeyDown={this.doOpenRecentWorkspaceEnter}>
                {nls.localizeByDefault('More...')}
            </a>
        </div>;
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className={codicon('history')}></i>{nls.localizeByDefault('Recent')}
            </h3>
            {items.length > 0 ? content : <p className='gs-no-recent'>
                {nls.localizeByDefault('You have no recent folders,') + ' '}
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={this.doOpenFolder}
                    onKeyDown={this.doOpenFolderEnter}>
                    {nls.localizeByDefault('open a folder')}
                </a>
                {' ' + nls.localizeByDefault('to start.')}
            </p>}
            {more}
        </div>;
    }

    /**
     * Render the settings section.
     * Generally used to display useful links.
     */
    protected renderSettings(): React.ReactNode {
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className={codicon('settings-gear')}></i>
                {nls.localizeByDefault('Settings')}
            </h3>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={this.doOpenPreferences}
                    onKeyDown={this.doOpenPreferencesEnter}>
                    {nls.localizeByDefault('Open Settings')}
                </a>
            </div>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={this.doOpenKeyboardShortcuts}
                    onKeyDown={this.doOpenKeyboardShortcutsEnter}>
                    {nls.localizeByDefault('Open Keyboard Shortcuts')}
                </a>
            </div>
        </div>;
    }

    /**
     * Render the help section.
     */
    protected renderHelp(): React.ReactNode {
        return <div className='gs-section'>
            <h3 className='gs-section-header'>
                <i className={codicon('question')}></i>
                {nls.localizeByDefault('Help')}
            </h3>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={() => this.doOpenExternalLink(this.documentationUrl)}
                    onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.documentationUrl)}>
                    {nls.localizeByDefault('Documentation')}
                </a>
            </div>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={() => this.doOpenExternalLink(this.compatibilityUrl)}
                    onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.compatibilityUrl)}>
                    {nls.localize('theia/getting-started/apiComparator', '{0} API Compatibility', 'VS Code')}
                </a>
            </div>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={() => this.doOpenExternalLink(this.extensionUrl)}
                    onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.extensionUrl)}>
                    {nls.localize('theia/getting-started/newExtension', 'Building a New Extension')}
                </a>
            </div>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    tabIndex={0}
                    onClick={() => this.doOpenExternalLink(this.pluginUrl)}
                    onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.pluginUrl)}>
                    {nls.localize('theia/getting-started/newPlugin', 'Building a New Plugin')}
                </a>
            </div>
        </div>;
    }

    /**
     * Render the version section.
     */
    protected renderVersion(): React.ReactNode {
        return <div className='gs-section'>
            <div className='gs-action-container'>
                <p className='gs-sub-header' >
                    {this.applicationInfo ? nls.localizeByDefault('Version: {0}', this.applicationInfo.version) : ''}
                </p>
            </div>
        </div>;
    }

    protected renderPreferences(): React.ReactNode {
        return <WelcomePreferences preferenceService={this.preferenceService}></WelcomePreferences>;
    }

    protected renderNews(): React.ReactNode {
        return <div className='gs-section'>
            <h3 className='gs-section-header'>🚀 AI Support in the Theia IDE is available (Beta Version)! ✨</h3>
            <div className='gs-action-container'>
                <a
                    role={'button'}
                    style={{ fontSize: 'var(--theia-ui-font-size2)' }}
                    tabIndex={0}
                    onClick={() => this.doOpenAIChatView()}
                    onKeyDown={(e: React.KeyboardEvent) => this.doOpenAIChatViewEnter(e)}>
                    {'Open the AI Chat View now to learn how to start! ✨'}
                </a>
            </div>
        </div>;
    }

    protected renderAIBanner(): React.ReactNode {
        return <div className='gs-container gs-aifeature-container'>
            <div className='flex-grid'>
                <div className='col'>
                    <h3 className='gs-section-header'> 🚀 AI Support in the Theia IDE is available (Beta Version)! ✨</h3>
                    <div className='gs-action-container'>
                        Theia IDE now contains AI support, which offers early access to cutting-edge AI capabilities within your IDE.
                        <br />
                        Please note that these features are disabled by default, ensuring that users can opt-in at their discretion.
                        For those who choose to enable AI support, it is important to be aware that these may generate continuous
                        requests to the language models (LLMs) you provide access to. This might incur costs that you need to monitor closely.
                        <br />
                        For more details, please visit &nbsp;
                        <a
                            role={'button'}
                            tabIndex={0}
                            onClick={() => this.doOpenExternalLink(this.userAIDocUrl)}
                            onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.userAIDocUrl)}>
                            {'the documentation'}
                        </a>.
                        <br />
                        <br />
                        🚧 Please note that this feature is currently in a beta state and may undergo changes.
                        We welcome your feedback, contributions, and sponsorship! To support the ongoing development of the AI capabilities please visit the&nbsp;
                        <a
                            role={'button'}
                            tabIndex={0}
                            onClick={() => this.doOpenExternalLink(this.ghProjectUrl)}
                            onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.ghProjectUrl)}>
                            {'Github Project'}
                        </a>.
                        &nbsp;Thank you for being part of our community!
                        <br />
                        The AI features are built on the framework Theia AI. If you want to build a custom AI-powered tool or IDE, Theia AI has been published as stable release.
                        Check out <a
                            role={'button'}
                            tabIndex={0}
                            onClick={() => this.doOpenExternalLink(this.theiaAIDocUrl)}
                            onKeyDown={(e: React.KeyboardEvent) => this.doOpenExternalLinkEnter(e, this.theiaAIDocUrl)}>
                            {'the Theia AI documentation'}
                        </a>!
                    </div>
                    <br />
                    <div className='gs-action-container'>
                        <a
                            role={'button'}
                            style={{ fontSize: 'var(--theia-ui-font-size2)' }}
                            tabIndex={0}
                            onClick={() => this.doOpenAIChatView()}
                            onKeyDown={(e: React.KeyboardEvent) => this.doOpenAIChatViewEnter(e)}>
                            {'Open the AI Chat View now to learn how to start! ✨'}
                        </a>
                    </div>
                </div>
            </div>
        </div>;
    }

    protected doOpenAIChatView = () => this.commandRegistry.executeCommand('aiChat:toggle');
    protected doOpenAIChatViewEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenAIChatView();
        }
    };

    /**
     * Build the list of workspace paths.
     * @param workspaces {string[]} the list of workspaces.
     * @returns {string[]} the list of workspace paths.
     */
    protected buildPaths(workspaces: string[]): string[] {
        const paths: string[] = [];
        workspaces.forEach(workspace => {
            const uri = new URI(workspace);
            const pathLabel = this.labelProvider.getLongName(uri);
            const path = this.home ? Path.tildify(pathLabel, this.home) : pathLabel;
            paths.push(path);
        });
        return paths;
    }

    /**
     * Trigger the create file command.
     */
    protected doCreateFile = () => this.commandRegistry.executeCommand(CommonCommands.PICK_NEW_FILE.id);
    protected doCreateFileEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doCreateFile();
        }
    };

    /**
     * Trigger the open command.
     */
    protected doOpen = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN.id);
    protected doOpenEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpen();
        }
    };

    /**
     * Trigger the open file command.
     */
    protected doOpenFile = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_FILE.id);
    protected doOpenFileEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenFile();
        }
    };

    /**
     * Trigger the open folder command.
     */
    protected doOpenFolder = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_FOLDER.id);
    protected doOpenFolderEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenFolder();
        }
    };

    /**
     * Trigger the open workspace command.
     */
    protected doOpenWorkspace = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_WORKSPACE.id);
    protected doOpenWorkspaceEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenWorkspace();
        }
    };

    /**
     * Trigger the open recent workspace command.
     */
    protected doOpenRecentWorkspace = () => this.commandRegistry.executeCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE.id);
    protected doOpenRecentWorkspaceEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenRecentWorkspace();
        }
    };

    /**
     * Trigger the open preferences command.
     * Used to open the preferences widget.
     */
    protected doOpenPreferences = () => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id);
    protected doOpenPreferencesEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenPreferences();
        }
    };

    /**
     * Trigger the open keyboard shortcuts command.
     * Used to open the keyboard shortcuts widget.
     */
    protected doOpenKeyboardShortcuts = () => this.commandRegistry.executeCommand(KeymapsCommands.OPEN_KEYMAPS.id);
    protected doOpenKeyboardShortcutsEnter = (e: React.KeyboardEvent) => {
        if (this.isEnterKey(e)) {
            this.doOpenKeyboardShortcuts();
        }
    };

    /**
     * Open a workspace given its uri.
     * @param uri {URI} the workspace uri.
     */
    protected open = (uri: URI) => this.workspaceService.open(uri);
    protected openEnter = (e: React.KeyboardEvent, uri: URI) => {
        if (this.isEnterKey(e)) {
            this.open(uri);
        }
    };

    /**
     * Open a link in an external window.
     * @param url the link.
     */
    protected doOpenExternalLink = (url: string) => this.windowService.openNewWindow(url, { external: true });
    protected doOpenExternalLinkEnter = (e: React.KeyboardEvent, url: string) => {
        if (this.isEnterKey(e)) {
            this.doOpenExternalLink(url);
        }
    };

    protected isEnterKey(e: React.KeyboardEvent): boolean {
        return Key.ENTER.keyCode === KeyCode.createKeyCode(e.nativeEvent).key?.keyCode;
    }
}

export interface PreferencesProps {
    preferenceService: PreferenceService;
}

function WelcomePreferences(props: PreferencesProps): JSX.Element {
    const [startupEditor, setStartupEditor] = React.useState<string>(
        props.preferenceService.get('workbench.startupEditor', 'welcomePage')
    );
    React.useEffect(() => {
        const prefListener = props.preferenceService.onPreferenceChanged(change => {
            if (change.preferenceName === 'workbench.startupEditor') {
                const prefValue = change.newValue;
                setStartupEditor(prefValue);
            }
        });
        return () => prefListener.dispose();
    }, [props.preferenceService]);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.checked ? 'welcomePage' : 'none';
        props.preferenceService.updateValue('workbench.startupEditor', newValue);
    };
    return (
        <div className='gs-preference'>
            <input
                type="checkbox"
                className="theia-input"
                id="startupEditor"
                onChange={handleChange}
                checked={startupEditor === 'welcomePage' || startupEditor === 'welcomePageInEmptyWorkbench'}
            />
            <label htmlFor="startupEditor">
                {nls.localizeByDefault('Show welcome page on startup')}
            </label>
        </div>
    );
}
