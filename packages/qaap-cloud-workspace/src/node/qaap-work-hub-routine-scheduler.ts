// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { routineIsDue } from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-routine';
import { QaapWorkHubRoutineRunner } from './qaap-work-hub-routine-runner';
import { QaapWorkHubRoutineStore } from './qaap-work-hub-routine-store';

const TICK_MS = 60_000;

@injectable()
export class QaapWorkHubRoutineScheduler {

    @inject(QaapWorkHubRoutineStore)
    protected readonly store: QaapWorkHubRoutineStore;

    @inject(QaapWorkHubRoutineRunner)
    protected readonly runner: QaapWorkHubRoutineRunner;

    protected timer: NodeJS.Timeout | undefined;
    protected ticking = false;

    @postConstruct()
    protected start(): void {
        this.timer = setInterval(() => { void this.tick(); }, TICK_MS);
        this.timer.unref?.();
        void this.tick();
    }

    protected async tick(): Promise<void> {
        if (this.ticking) {
            return;
        }
        this.ticking = true;
        try {
            const now = Date.now();
            for (const routine of this.store.list()) {
                if (!routineIsDue(routine, now)) {
                    continue;
                }
                try {
                    this.runner.runNow(routine.id);
                } catch (error) {
                    console.warn(`[qaap-work-hub-routines] scheduled run failed for ${routine.id}:`, error);
                }
            }
        } finally {
            this.ticking = false;
        }
    }
}
