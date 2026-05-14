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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Message, MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import URI from '@theia/core/lib/common/uri';
import { NavigatableWidget, StatefulWidget } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { BaseWidget, codicon, PanelLayout } from '@theia/core/lib/browser/widgets/widget';
import { MiniBrowserProps, MiniBrowserContentFactory } from './mini-browser-content';

export { MiniBrowserProps };

@injectable()
export class MiniBrowserOptions {
    uri: URI;
}

@injectable()
export class MiniBrowser extends BaseWidget implements NavigatableWidget, StatefulWidget {

    static ID = 'mini-browser';
    static ICON = codicon('globe');

    @inject(MiniBrowserOptions)
    protected readonly options: MiniBrowserOptions;

    @inject(MiniBrowserContentFactory)
    protected readonly createContent: MiniBrowserContentFactory;

    @postConstruct()
    protected init(): void {
        const { uri } = this.options;
        this.id = `${MiniBrowser.ID}:${uri.toString()}`;
        this.title.closable = true;
        this.layout = new PanelLayout({ fitPolicy: 'set-no-constraint' });
        this.toDispose.push(this.toDisposeOnProps);
    }

    getResourceUri(): URI | undefined {
        return this.options.uri;
    }

    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.options.uri && this.options.uri.withPath(resourceUri.path);
    }

    protected props: MiniBrowserProps | undefined;
    protected readonly toDisposeOnProps = new DisposableCollection();

    setProps(raw: MiniBrowserProps): void {
        const props: MiniBrowserProps = {
            toolbar: raw.toolbar,
            startPage: raw.startPage,
            sandbox: raw.sandbox,
            iconClass: raw.iconClass,
            name: raw.name,
            resetBackground: raw.resetBackground
        };
        this.toDisposeOnProps.dispose();
        this.props = props;

        this.title.caption = this.title.label = props.name || 'Browser';
        this.title.iconClass = props.iconClass || MiniBrowser.ICON;

        const content = this.createContent(props);
        (this.layout as PanelLayout).addWidget(content);
        this.toDisposeOnProps.push(content);
        this.scheduleInitialContentNavigation();
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        MessageLoop.postMessage(this, Widget.Msg.FitRequest);
        MessageLoop.postMessage(this, Widget.Msg.UpdateRequest);
        this.scheduleInitialContentNavigation();
    }

    /**
     * Re-run navigation after the shell has attached this widget so Lumino has measured the panel.
     * Re-resolves the content child inside the deferred callback (setProps can replace it).
     */
    protected scheduleInitialContentNavigation(): void {
        const start = this.props?.startPage?.trim();
        if (!start || !this.isAttached || this.isDisposed) {
            return;
        }
        queueMicrotask(() => {
            requestAnimationFrame(() => {
                if (!this.isAttached || this.isDisposed) {
                    return;
                }
                const layout = this.layout as PanelLayout;
                const w = layout.widgets[0] as { isDisposed?: boolean; forceNavigate?: (u: string) => Promise<void> } | undefined;
                if (!w || w.isDisposed || typeof w.forceNavigate !== 'function') {
                    return;
                }
                void w.forceNavigate.call(w, start);
            });
        });
    }

    protected override onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const widget = (this.layout as PanelLayout).widgets[0];
        if (widget) {
            widget.activate();
        }
    }

    storeState(): object {
        const { props } = this;
        return { props };
    }

    restoreState(oldState: object): void {
        if (!this.toDisposeOnProps.disposed) {
            return;
        }
        if ('props' in oldState) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.setProps((<any>oldState)['props']);
        }
    }

}
