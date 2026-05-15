// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '../../common';
import { ApplicationShell } from '../shell/application-shell';
import { Widget } from '../widgets/widget';

/**
 * Product hook for widgets placed in `#theia-top-panel` beside the menu bar.
 * Default implementation matches upstream Theia (branding icon, no trailing controls).
 */
export const WorkbenchTopBarFactory = Symbol('WorkbenchTopBarFactory');

export interface WorkbenchTopBarFactory {
    /** Widget at the leading edge of the top panel (upstream: `theia:icon` logo). */
    createLeadingTopBarWidget(commands: CommandRegistry): Widget;
    /** Optional widgets after the menu bar (e.g. terminal / settings on the right). */
    createTrailingTopBarWidgets(commands: CommandRegistry, shell: ApplicationShell): Widget[];
}

@injectable()
export class DefaultWorkbenchTopBarFactory implements WorkbenchTopBarFactory {

    createLeadingTopBarWidget(_commands: CommandRegistry): Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }

    createTrailingTopBarWidgets(_commands: CommandRegistry, _shell: ApplicationShell): Widget[] {
        return [];
    }
}
