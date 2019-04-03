/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { injectable, inject } from 'inversify';
import { TaskService } from './task-service';
import { TaskRunQuickOpenItem } from './quick-open-task';
import { QuickOpenBaseAction, QuickOpenItem, QuickOpenActionProvider, QuickOpenAction } from '@theia/core/lib/browser/quick-open';
import { ThemeService } from '@theia/core/lib/browser/theming';

@injectable()
export class ConfigureTaskAction extends QuickOpenBaseAction {

    @inject(TaskService)
    protected readonly taskService: TaskService;

    constructor() {
        super({ id: 'configure:task' });

        this.updateTheme();

        ThemeService.get().onThemeChange(() => this.updateTheme());
    }

    async run(item?: QuickOpenItem): Promise<void> {
        if (item instanceof TaskRunQuickOpenItem) {
            this.taskService.configure(item.getTask());
        }
    }

    protected updateTheme(): void {
        const theme = ThemeService.get().getCurrentTheme().id;
        if (theme === 'dark') {
            this.class = 'quick-open-task-configure-dark';
        } else if (theme === 'light') {
            this.class = 'quick-open-task-configure-bright';
        }
    }
}

@injectable()
export class TaskActionProvider implements QuickOpenActionProvider {

    @inject(ConfigureTaskAction)
    protected configureTaskAction: ConfigureTaskAction;

    hasActions(): boolean {
        return true;
    }

    async getActions(): Promise<QuickOpenAction[]> {
        return [this.configureTaskAction];
    }
}
