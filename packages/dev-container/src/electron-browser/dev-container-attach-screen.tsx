// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, ReactWidget, Widget } from '@theia/core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { nls } from '@theia/core';

export interface AttachScreenErrorActions {
    /** Re-run the attach. */
    retry: () => void;
    /** Dismiss the screen and reveal the (empty) local window. */
    close: () => void;
}

/**
 * Full-window, interaction-blocking "attaching" screen shown during a CLI-driven dev-container
 * attach. It hides the transient local workbench (which is discarded once the window reloads into
 * the container) so the user is never left interacting with the wrong window, and it surfaces the
 * attach progress and any failure with a clear retry/close choice.
 */
@injectable()
export class DevContainerAttachScreen extends ReactWidget {

    static readonly ID = 'dev-container-attach-screen';

    protected containerName: string | undefined;
    protected stage: string = nls.localize('theia/remote/dev-container/attachScreen/preparing', 'Preparing to attach…');
    protected error: { message: string, actions: AttachScreenErrorActions } | undefined;

    /** URL of the application's configured splash image, reused here for consistent startup branding. */
    protected splashUrl: string | undefined;
    protected splashFailed = false;

    @postConstruct()
    protected init(): void {
        this.id = DevContainerAttachScreen.ID;
        this.addClass('theia-dev-container-attach-screen');
        this.splashUrl = DevContainerAttachScreen.resolveSplashUrl(
            FrontendApplicationConfigProvider.get().electron?.splashScreenOptions?.content,
            location.href
        );
    }

    /** Shows the screen (attaching it to the document on first use) and optionally sets the target name. */
    showAttaching(containerName?: string): void {
        if (containerName) {
            this.containerName = containerName;
        }
        this.error = undefined;
        if (!this.isAttached) {
            Widget.attach(this, document.body);
        }
        this.update();
    }

    /** Updates the current progress line, e.g. from a {@link RemoteStatusReport} message. */
    reportStage(message: string): void {
        if (message) {
            this.stage = message;
            this.update();
        }
    }

    /** Switches the screen to an error state offering retry and close. */
    reportError(message: string, actions: AttachScreenErrorActions): void {
        this.error = { message, actions };
        if (!this.isAttached) {
            Widget.attach(this, document.body);
        }
        this.update();
    }

    override dispose(): void {
        if (this.isAttached) {
            Widget.detach(this);
        }
        super.dispose();
    }

    protected render(): React.ReactNode {
        return <div className='theia-dev-container-attach-screen-content'>
            {this.renderSplash()}
            {this.error ? this.renderError(this.error.message, this.error.actions) : this.renderProgress()}
        </div>;
    }

    protected renderSplash(): React.ReactNode {
        if (!this.splashUrl || this.splashFailed) {
            return undefined;
        }
        return <img className='theia-dev-container-attach-screen-logo' src={this.splashUrl} alt='' onError={this.onSplashError} />;
    }

    protected onSplashError = () => {
        // The image may be blocked (e.g. by CSP) or the content may not be an image; fall back to the spinner only.
        this.splashFailed = true;
        this.update();
    };

    protected renderProgress(): React.ReactNode {
        const title = this.containerName
            ? nls.localize('theia/remote/dev-container/attachScreen/titleNamed', 'Attaching to {0}', this.containerName)
            : nls.localize('theia/remote/dev-container/attachScreen/title', 'Attaching to container');
        return <React.Fragment>
            <span className={`${codicon('loading')} theia-animation-spin theia-dev-container-attach-screen-spinner`} />
            <h1 className='theia-dev-container-attach-screen-title'>{title}</h1>
            <div className='theia-dev-container-attach-screen-stage'>{this.stage}</div>
            <div className='theia-dev-container-attach-screen-note'>
                {nls.localize('theia/remote/dev-container/attachScreen/firstStartNote',
                    'The first start for a container can take a minute or two. Later starts are much faster.')}
            </div>
        </React.Fragment>;
    }

    protected renderError(message: string, actions: AttachScreenErrorActions): React.ReactNode {
        return <React.Fragment>
            <div className='theia-dev-container-attach-screen-alert'>
                <AlertMessage
                    type='ERROR'
                    header={nls.localize('theia/remote/dev-container/attachScreen/errorHeader', 'Failed to attach to container')}
                >
                    {message}
                </AlertMessage>
            </div>
            <div className='theia-dev-container-attach-screen-actions'>
                <button className='theia-button' onClick={actions.retry}>
                    {nls.localizeByDefault('Retry')}
                </button>
                <button className='theia-button secondary' onClick={actions.close}>
                    {nls.localizeByDefault('Close')}
                </button>
            </div>
        </React.Fragment>;
    }
}

export namespace DevContainerAttachScreen {
    /**
     * Resolves the application's splash screen `content` (as configured in
     * `electron.splashScreenOptions`) to a URL loadable from the frontend, given the frontend
     * document's `baseHref`. A relative path is resolved against the application root: the frontend
     * HTML lives at `<appRoot>/lib/frontend/`, so it is two levels up. An absolute path or an
     * already-absolute URL is used as-is (mirroring the main process, which passes `content` through
     * `path.resolve`). Returns `undefined` when no content is configured or the URL cannot be built.
     */
    export function resolveSplashUrl(content: string | undefined, baseHref: string): string | undefined {
        if (!content) {
            return undefined;
        }
        // A relative path is anchored below `lib/frontend/`; anything already absolute (an absolute
        // filesystem path or a full URL) must not get the `../../` prefix or it would be mangled.
        const specifier = isAbsolute(content) ? content : `../../${content}`;
        try {
            return new URL(specifier, baseHref).toString();
        } catch {
            return undefined;
        }
    }

    function isAbsolute(content: string): boolean {
        // POSIX/UNC path, Windows drive path (e.g. `C:\...`), or a URL with a scheme (e.g. `file:`, `https:`, `data:`).
        return content.startsWith('/') || content.startsWith('\\') || /^[a-zA-Z]:[\\/]/.test(content) || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(content);
    }
}
