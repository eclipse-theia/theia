// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DialogProps, DialogError } from '@theia/core/lib/browser/dialogs';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { CommandService, nls } from '@theia/core';
import { CopilotAuthService, DeviceCodeResponse } from '../common/copilot-auth-service';

const OPEN_AI_CONFIG_VIEW_COMMAND = 'aiConfiguration:open';

type AuthDialogState = 'loading' | 'waiting' | 'polling' | 'success' | 'error';

@injectable()
export class CopilotAuthDialogProps extends DialogProps {
    enterpriseUrl?: string;
}

@injectable()
export class CopilotAuthDialog extends ReactDialog<boolean> {

    @inject(CopilotAuthService)
    protected readonly authService: CopilotAuthService;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    protected state: AuthDialogState = 'loading';
    protected deviceCodeResponse?: DeviceCodeResponse;
    protected errorMessage?: string;
    protected copied = false;

    static readonly ID = 'copilot-auth-dialog';

    constructor(
        @inject(CopilotAuthDialogProps) protected override readonly props: CopilotAuthDialogProps
    ) {
        super(props);
    }

    @postConstruct()
    protected init(): void {
        this.titleNode.textContent = this.props.title;
        this.appendAcceptButton(nls.localize('theia/ai/copilot/auth/authorize', 'I have authorized'));
        this.appendCloseButton(nls.localizeByDefault('Cancel'));
    }

    protected updateButtonStates(): void {
        const isPolling = this.state === 'polling';
        const isSuccess = this.state === 'success';
        if (this.acceptButton) {
            this.acceptButton.disabled = isPolling || isSuccess;
            if (isSuccess) {
                this.acceptButton.style.display = 'none';
            }
        }
        if (this.closeButton) {
            if (isSuccess) {
                this.closeButton.textContent = nls.localizeByDefault('Close');
            }
        }
    }

    override async open(): Promise<boolean | undefined> {
        this.initiateFlow();
        return super.open();
    }

    override update(): void {
        super.update();
        this.updateButtonStates();
    }

    protected async initiateFlow(): Promise<void> {
        try {
            this.state = 'loading';
            this.update();

            this.deviceCodeResponse = await this.authService.initiateDeviceFlow(this.props.enterpriseUrl);
            this.state = 'waiting';
            this.update();
        } catch (error) {
            this.state = 'error';
            this.errorMessage = error instanceof Error ? error.message : String(error);
            this.update();
        }
    }

    protected override async accept(): Promise<void> {
        if (this.state !== 'waiting' || !this.deviceCodeResponse) {
            return;
        }

        this.state = 'polling';
        this.update();

        try {
            const success = await this.authService.pollForToken(
                this.deviceCodeResponse.device_code,
                this.deviceCodeResponse.interval,
                this.props.enterpriseUrl
            );

            if (success) {
                this.state = 'success';
                this.update();
            } else {
                this.state = 'error';
                this.errorMessage = nls.localize('theia/ai/copilot/auth/expired',
                    'Authorization expired or was denied. Please try again.');
                this.update();
            }
        } catch (error) {
            this.state = 'error';
            this.errorMessage = error instanceof Error ? error.message : String(error);
            this.update();
        }
    }

    get value(): boolean {
        return this.state === 'success';
    }

    protected override isValid(_value: boolean, _mode: DialogError): DialogError {
        if (this.state === 'error') {
            return this.errorMessage ?? 'An error occurred';
        }
        return '';
    }

    protected handleCopyCode = async (): Promise<void> => {
        if (this.deviceCodeResponse) {
            await this.clipboardService.writeText(this.deviceCodeResponse.user_code);
            this.copied = true;
            this.update();
            setTimeout(() => {
                this.copied = false;
                this.update();
            }, 2000);
        }
    };

    protected handleOpenUrl = (): void => {
        if (this.deviceCodeResponse) {
            this.windowService.openNewWindow(this.deviceCodeResponse.verification_uri, { external: true });
        }
    };

    protected render(): React.ReactNode {
        return (
            <div className="theia-copilot-auth-dialog-content">
                {this.renderContent()}
            </div>
        );
    }

    protected renderContent(): React.ReactNode {
        switch (this.state) {
            case 'loading':
                return this.renderLoading();
            case 'waiting':
                return this.renderWaiting();
            case 'polling':
                return this.renderPolling();
            case 'success':
                return this.renderSuccess();
            case 'error':
                return this.renderError();
            default:
                return undefined;
        }
    }

    protected renderLoading(): React.ReactNode {
        return (
            <div className="theia-copilot-auth-state">
                <div className="theia-spin">
                    <span className="codicon codicon-loading"></span>
                </div>
                <p>{nls.localize('theia/ai/copilot/auth/initiating', 'Initiating authentication...')}</p>
            </div>
        );
    }

    protected renderWaiting(): React.ReactNode {
        const response = this.deviceCodeResponse!;
        return (
            <div className="theia-copilot-auth-waiting">
                <p className="theia-copilot-auth-instructions">
                    {nls.localize('theia/ai/copilot/auth/instructions',
                        'To authorize Theia to use GitHub Copilot, visit the URL below and enter the code:')}
                </p>

                <div className="theia-copilot-auth-code-section">
                    <div className="theia-copilot-auth-code-display">
                        <span className="theia-copilot-auth-code">{response.user_code}</span>
                        <button
                            className="theia-button secondary theia-copilot-copy-button"
                            onClick={this.handleCopyCode}
                            title={this.copied
                                ? nls.localize('theia/ai/copilot/auth/copied', 'Copied!')
                                : nls.localize('theia/ai/copilot/auth/copyCode', 'Copy code')}
                        >
                            <span className={`codicon ${this.copied ? 'codicon-check' : 'codicon-copy'}`}></span>
                            {nls.localizeByDefault('Copy')}
                        </button>
                    </div>
                </div>

                <div className="theia-copilot-auth-url-section">
                    <button
                        className="theia-button theia-copilot-open-url-button"
                        onClick={this.handleOpenUrl}
                    >
                        <span className="codicon codicon-link-external"></span>
                        {nls.localize('theia/ai/copilot/auth/openGitHub', 'Open GitHub')}
                    </button>
                    <span className="theia-copilot-auth-url">{response.verification_uri}</span>
                </div>

                <p className="theia-copilot-auth-hint">
                    {nls.localize('theia/ai/copilot/auth/hint',
                        'After entering the code and authorizing, click "I have authorized" below.')}
                </p>

                <div className="theia-copilot-auth-privacy">
                    <p className="theia-copilot-auth-privacy-text">
                        {nls.localize('theia/ai/copilot/auth/privacy',
                            'Theia is an open-source project. We only request access to your GitHub username ' +
                            'to connect to GitHub Copilot services — no other data is accessed or stored.')}
                    </p>
                    <p className="theia-copilot-auth-tos-text">
                        {nls.localize('theia/ai/copilot/auth/tos',
                            'By signing in, you agree to the ')}
                        <a
                            href="https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={this.handleOpenTos}
                        >
                            {nls.localize('theia/ai/copilot/auth/tosLink', 'GitHub Terms of Service')}
                        </a>.
                    </p>
                </div>
            </div>
        );
    }

    protected handleOpenTos = (e: React.MouseEvent): void => {
        e.preventDefault();
        this.windowService.openNewWindow('https://docs.github.com/en/site-policy/github-terms/github-terms-of-service', { external: true });
    };

    protected renderPolling(): React.ReactNode {
        return (
            <div className="theia-copilot-auth-state">
                <div className="theia-spin">
                    <span className="codicon codicon-loading"></span>
                </div>
                <p>{nls.localize('theia/ai/copilot/auth/verifying', 'Verifying authorization...')}</p>
            </div>
        );
    }

    protected renderSuccess(): React.ReactNode {
        return (
            <div className="theia-copilot-auth-state theia-copilot-auth-success">
                <span className="codicon codicon-check"></span>
                <p>{nls.localize('theia/ai/copilot/auth/success', 'Successfully signed in to GitHub Copilot!')}</p>
                <p className="theia-copilot-auth-success-hint">
                    {nls.localize('theia/ai/copilot/auth/successHint',
                        'If your GitHub account has access to Copilot, you can now configure Copilot language models in the ')}
                    <a href="#" onClick={this.handleOpenAIConfig}>
                        {nls.localize('theia/ai/copilot/auth/aiConfiguration', 'AI Configuration')}
                    </a>.
                </p>
            </div>
        );
    }

    protected handleOpenAIConfig = (e: React.MouseEvent): void => {
        e.preventDefault();
        this.commandService.executeCommand(OPEN_AI_CONFIG_VIEW_COMMAND);
    };

    protected handleRetry = (): void => {
        this.initiateFlow();
    };

    protected renderError(): React.ReactNode {
        return (
            <div className="theia-copilot-auth-state theia-copilot-auth-error">
                <span className="codicon codicon-error"></span>
                <p>{this.errorMessage}</p>
                <button
                    className="theia-button"
                    onClick={this.handleRetry}
                >
                    {nls.localizeByDefault('Try Again')}
                </button>
            </div>
        );
    }
}
