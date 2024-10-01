// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable, named } from 'inversify';
import { Widget } from './widgets';
import { StatusBar } from './status-bar';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { ContributionProvider } from '../common';
import { FrontendApplication } from './frontend-application';

export const WidgetStatusBarContribution = Symbol('WidgetStatusBarContribution');

export interface WidgetStatusBarContribution<T extends Widget> {
    canHandle(widget: Widget): widget is T;
    activate(statusBar: StatusBar, widget: T): void;
    deactivate(statusBar: StatusBar): void;
}

/**
 * Creates an empty {@link WidgetStatusBarContribution} that does nothing.
 * Useful for widgets that are not handled by any other contribution, for example:
 * * Settings widget
 * * Welcome widget
 * * Webview widget
 *
 * @param prototype Prototype to identify the kind of the widget.
 * @returns An empty {@link WidgetStatusBarContribution}.
 */
export function noopWidgetStatusBarContribution(prototype: Function): WidgetStatusBarContribution<Widget> {
    return {
        canHandle(widget: Widget): widget is Widget {
            return widget instanceof prototype;
        },
        activate: () => { },
        deactivate: () => { }
    };
}

@injectable()
export class WidgetStatusBarService implements FrontendApplicationContribution {

    @inject(ContributionProvider) @named(WidgetStatusBarContribution)
    protected readonly contributionProvider: ContributionProvider<WidgetStatusBarContribution<Widget>>;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    onStart(app: FrontendApplication): void {
        app.shell.onDidChangeCurrentWidget(event => {
            if (event.newValue) {
                this.show(event.newValue);
            }
        });
    }

    protected show(widget: Widget): void {
        const contributions = this.contributionProvider.getContributions();
        // If any contribution can handle the widget, activate it
        // If none can, keep everything as is
        if (contributions.some(contribution => contribution.canHandle(widget))) {
            for (const contribution of contributions) {
                // Deactivate all contributions
                contribution.deactivate(this.statusBar);
                if (contribution.canHandle(widget)) {
                    // Selectively re-activate them
                    contribution.activate(this.statusBar, widget);
                }
            }
        }
    }
}
