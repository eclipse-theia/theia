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

import * as React from '@theia/core/shared/react';
import { inject, postConstruct, injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core';
import { ReactWidget } from '@theia/core/lib/browser/widgets';
import { DebugViewModel } from './debug-view-model';
import { DebugState } from '../debug-session';
import { DebugAction } from './debug-action';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class DebugToolBar extends ReactWidget {

    @inject(DebugViewModel)
    protected readonly model: DebugViewModel;

    @postConstruct()
    protected init(): void {
        this.id = 'debug:toolbar:' + this.model.id;
        this.addClass('debug-toolbar');
        this.toDispose.push(this.model);
        this.toDispose.push(this.model.onDidChange(() => this.update()));
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

    protected render(): React.ReactNode {
        const { state } = this.model;
        return <React.Fragment>
            {this.renderContinue()}
            <DebugAction enabled={state === DebugState.Stopped} run={this.stepOver} label={nls.localizeByDefault('Step Over')}
                iconClass='debug-step-over' ref={this.setStepRef} />
            <DebugAction enabled={state === DebugState.Stopped} run={this.stepIn} label={nls.localizeByDefault('Step Into')}
                iconClass='debug-step-into' />
            <DebugAction enabled={state === DebugState.Stopped} run={this.stepOut} label={nls.localizeByDefault('Step Out')}
                iconClass='debug-step-out' />
            <DebugAction enabled={state !== DebugState.Inactive} run={this.restart} label={nls.localizeByDefault('Restart')}
                iconClass='debug-restart' />
            {this.renderStart()}
        </React.Fragment>;
    }
    protected renderStart(): React.ReactNode {
        const { state } = this.model;
        if (state === DebugState.Inactive && this.model.sessionCount === 1) {
            return <DebugAction run={this.start} label={nls.localizeByDefault('Start')} iconClass='debug-start' />;
        }
        return <DebugAction enabled={state !== DebugState.Inactive} run={this.stop} label={nls.localizeByDefault('Stop')} iconClass='debug-stop' />;
    }
    protected renderContinue(): React.ReactNode {
        const { state } = this.model;
        if (state === DebugState.Stopped) {
            return <DebugAction run={this.continue} label={nls.localizeByDefault('Continue')} iconClass='debug-continue' />;
        }
        return <DebugAction enabled={state === DebugState.Running} run={this.pause} label={nls.localizeByDefault('Pause')} iconClass='debug-pause' />;
    }

    protected start = () => this.model.start();
    protected restart = () => this.model.restart();
    protected stop = () => this.model.terminate();
    protected continue = () => this.model.currentThread && this.model.currentThread.continue();
    protected pause = () => this.model.currentThread && this.model.currentThread.pause();
    protected stepOver = () => this.model.currentThread && this.model.currentThread.stepOver();
    protected stepIn = () => this.model.currentThread && this.model.currentThread.stepIn();
    protected stepOut = () => this.model.currentThread && this.model.currentThread.stepOut();

}
