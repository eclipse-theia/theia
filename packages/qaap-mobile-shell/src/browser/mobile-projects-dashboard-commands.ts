// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Command } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';

/** Toggle the cross-project dashboard overlay from the top bar or a left-edge swipe. */
export const QAAP_MOBILE_TOGGLE_PROJECTS_DASHBOARD = 'qaap.mobile.toggleProjectsDashboard';

export namespace QaapMobileProjectsDashboardCommands {
    export const TOGGLE: Command = {
        id: QAAP_MOBILE_TOGGLE_PROJECTS_DASHBOARD,
        label: nls.localize('qaap/mobileProjects/toggleDashboard', 'Projects dashboard'),
        category: 'View',
    };
}
