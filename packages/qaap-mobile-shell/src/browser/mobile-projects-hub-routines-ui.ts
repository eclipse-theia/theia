// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import {
    runWorkHubRoutineNow,
    updateWorkHubRoutine,
} from '../common/qaap-work-hub-routine-client';
import {
    filterRoutinesByQuery,
    routineScheduleLabel,
    type QaapWorkHubRoutine,
} from '../common/qaap-work-hub-routine';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for the Routines hub list, row actions, and polling while runs are active. */
export interface MobileProjectsHubRoutinesHost {
    query: string;
    scroll: HTMLElement;
    hubView: MobileProjectsHubView;
    visible: boolean;
    workHubRoutines: QaapWorkHubRoutine[];
    workHubRoutinesLoaded: boolean;
    workHubRoutinesLoading: boolean;
    routineInteractionLock: boolean;
    routineSheet: HTMLElement | undefined;
    routinesRefreshTimer: number | undefined;
    messageService: MessageService | undefined;

    refreshWorkHubRoutines(force?: boolean): Promise<void>;
    openRoutineEditor(routine: QaapWorkHubRoutine): void;
    renderSubtitle(): void;
    renderList(): void;
}

/** Routines hub list rendering, enable/run row actions, and refresh polling. */
export class MobileProjectsHubRoutinesUi {

    constructor(protected readonly host: MobileProjectsHubRoutinesHost) { }

    renderRoutinesHubView(): void {
        if (!this.host.workHubRoutinesLoaded && !this.host.workHubRoutinesLoading) {
            void this.host.refreshWorkHubRoutines();
        }
        const routines = this.sortRoutinesForDisplay(filterRoutinesByQuery(this.host.workHubRoutines, this.host.query));
        if (!this.host.workHubRoutinesLoaded && this.host.workHubRoutinesLoading) {
            this.host.scroll.append(this.createRoutinesLoadingState());
            this.host.renderSubtitle();
            return;
        }
        if (routines.length === 0) {
            this.host.scroll.append(this.createRoutinesEmptyState());
            this.host.renderSubtitle();
            return;
        }
        const host = document.createElement('div');
        host.className = 'theia-mobile-hub-routines';
        const group = document.createElement('div');
        group.className = 'theia-mobile-hub-routines-group';
        for (const routine of routines) {
            group.append(this.createRoutineRow(routine));
        }
        host.append(group);
        this.host.scroll.append(host);
        this.host.renderSubtitle();
        this.scheduleRoutinesRefreshWhileRunning();
    }

    sortRoutinesForDisplay(routines: readonly QaapWorkHubRoutine[]): QaapWorkHubRoutine[] {
        const rank = (routine: QaapWorkHubRoutine): number => {
            if (routine.lastRunState === 'running') {
                return 0;
            }
            if (routine.enabled) {
                return 1;
            }
            return 2;
        };
        return [...routines].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    }

    scheduleRoutinesRefreshWhileRunning(): void {
        window.clearTimeout(this.host.routinesRefreshTimer);
        if (this.host.routineInteractionLock || this.host.routineSheet) {
            return;
        }
        const hasRunning = this.host.workHubRoutines.some(r => r.lastRunState === 'running');
        if (!hasRunning || this.host.hubView !== 'routines' || !this.host.visible) {
            return;
        }
        this.host.routinesRefreshTimer = window.setTimeout(() => {
            void this.host.refreshWorkHubRoutines(true);
        }, 4000);
    }

    createRoutinesLoadingState(): HTMLElement {
        const loading = document.createElement('div');
        loading.className = 'theia-mobile-projects-empty theia-mod-routines-loading';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/routinesLoading', 'Loading routines…');
        loading.append(title);
        return loading;
    }

    createRoutinesEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-routines-empty';
        const title = document.createElement('strong');
        title.textContent = this.host.query
            ? nls.localize('qaap/mobileProjects/routinesEmpty', 'No routines match your search')
            : nls.localize('qaap/mobileProjects/routinesEmptyAll', 'No routines yet');
        const body = document.createElement('span');
        body.textContent = this.host.query
            ? nls.localize(
                'qaap/mobileProjects/routinesEmptySearchBody',
                'Try another keyword or clear the search.',
            )
            : nls.localize(
                'qaap/mobileProjects/routinesEmptyBody',
                'Tap + to schedule an agent on your VPS.',
            );
        empty.append(title, body);
        return empty;
    }

    routineRowSubtitle(routine: QaapWorkHubRoutine): string {
        if (routine.lastRunState === 'running') {
            return nls.localize('qaap/mobileProjects/routineStatusRunning', 'Running');
        }
        if (routine.lastRunState === 'failed') {
            return nls.localize('qaap/mobileProjects/routineStatusFailed', 'Failed');
        }
        if (!routine.enabled) {
            return nls.localize('qaap/mobileProjects/routinesSectionPaused', 'Paused');
        }
        return routineScheduleLabel(routine);
    }

    createRoutineRow(routine: QaapWorkHubRoutine): HTMLElement {
        const row = document.createElement('article');
        row.className = 'theia-mobile-hub-routine-row';
        if (routine.lastRunState === 'running') {
            row.classList.add('theia-mod-running');
        }
        if (!routine.enabled) {
            row.classList.add('theia-mod-paused');
        }

        const main = document.createElement('div');
        main.className = 'theia-mobile-hub-routine-main';
        main.setAttribute('role', 'button');
        main.tabIndex = 0;

        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-routine-title';
        title.textContent = routine.title;
        const meta = document.createElement('span');
        meta.className = 'theia-mobile-hub-routine-meta';
        meta.textContent = this.routineRowSubtitle(routine);
        main.append(title, meta);

        const openEditor = (): void => this.host.openRoutineEditor(routine);
        main.addEventListener('click', openEditor);
        main.addEventListener('keydown', (ev: KeyboardEvent) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openEditor();
            }
        });

        const trailing = document.createElement('div');
        trailing.className = 'theia-mobile-hub-routine-trailing';
        trailing.addEventListener('click', ev => ev.stopPropagation());
        trailing.addEventListener('pointerdown', ev => ev.stopPropagation());

        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'theia-mobile-hub-routine-run q-icon-button codicon codicon-debug-start';
        run.title = nls.localize('qaap/mobileProjects/routineRun', 'Run');
        run.setAttribute('aria-label', run.title);
        run.disabled = routine.lastRunState === 'running';
        run.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            void this.runRoutineNow(routine);
        });

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'theia-mobile-hub-routine-toggle';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', routine.enabled ? 'true' : 'false');
        toggle.title = routine.enabled
            ? nls.localize('qaap/mobileProjects/routineDisable', 'Disable routine')
            : nls.localize('qaap/mobileProjects/routineEnable', 'Enable routine');
        toggle.setAttribute('aria-label', toggle.title);
        toggle.classList.toggle('theia-mod-on', routine.enabled);
        toggle.addEventListener('click', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            void this.toggleRoutineEnabled(routine);
        });

        trailing.append(run, toggle);
        row.append(main, trailing);
        return row;
    }

    async toggleRoutineEnabled(routine: QaapWorkHubRoutine): Promise<void> {
        const previousEnabled = routine.enabled;
        const nextEnabled = !previousEnabled;
        this.host.routineInteractionLock = true;
        this.patchRoutineLocally(routine.id, { enabled: nextEnabled });
        try {
            await updateWorkHubRoutine(routine.id, { enabled: nextEnabled });
        } catch (error) {
            this.patchRoutineLocally(routine.id, { enabled: previousEnabled });
            this.host.messageService?.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.host.routineInteractionLock = false;
            await this.host.refreshWorkHubRoutines(true);
        }
    }

    async runRoutineNow(routine: QaapWorkHubRoutine): Promise<void> {
        this.host.routineInteractionLock = true;
        this.patchRoutineLocally(routine.id, { lastRunState: 'running' });
        try {
            await runWorkHubRoutineNow(routine.id);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineStarted', 'Routine started on the VPS'),
                { kind: 'success', duration: 1800 },
            );
        } catch (error) {
            this.host.messageService?.error(error instanceof Error ? error.message : String(error));
        } finally {
            this.host.routineInteractionLock = false;
            await this.host.refreshWorkHubRoutines(true);
        }
    }

    patchRoutineLocally(
        id: string,
        patch: Partial<Pick<QaapWorkHubRoutine, 'enabled' | 'lastRunState'>>,
    ): void {
        this.host.workHubRoutines = this.host.workHubRoutines.map(routine =>
            routine.id === id ? { ...routine, ...patch } : routine,
        );
        if (this.host.visible && this.host.hubView === 'routines' && !this.host.routineSheet) {
            this.host.renderList();
        }
    }
}
