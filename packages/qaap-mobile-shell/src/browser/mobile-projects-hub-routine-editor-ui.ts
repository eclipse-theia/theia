// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { MessageService } from '@theia/core/lib/common/message-service';
import {
    createWorkHubRoutine,
    deleteWorkHubRoutine,
    fetchWorkHubRoutines,
    updateWorkHubRoutine,
} from '../common/qaap-work-hub-routine-client';
import {
    type QaapWorkHubRoutine,
    type QaapWorkHubRoutineRunMode,
    type QaapWorkHubRoutineTrigger,
} from '../common/qaap-work-hub-routine';
import { QAAP_ROUTINE_CRON_PRESETS } from '../common/qaap-work-hub-cron';
import {
    fetchAgentTaskListAll,
    filterUiSelectableVpsAgents,
    QAIQ_AGENT_ID,
} from '../common/qaap-agent-task-client';
import { createAgentPickerField } from './qaap-agent-ui';
import { createFormFieldLabel, createSegmentedField } from './qaap-mobile-form-ui';
import { MobileSnackbar } from './mobile-snackbar';
import type { MobileProjectsHubView, MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';

/** Panel surface for routine editor sheet, fetch, and persistence. */
export interface MobileProjectsHubRoutineEditorHost {
    projects: MobileProjectEntry[];
    visible: boolean;
    hubView: MobileProjectsHubView;
    workHubRoutines: QaapWorkHubRoutine[];
    workHubRoutinesLoaded: boolean;
    workHubRoutinesLoading: boolean;
    workHubRoutinesDefaultAgent: string | undefined;
    routineSheet: HTMLElement | undefined;
    editingRoutineId: string | undefined;
    projectsService: MobileProjectsService;
    messageService: MessageService | undefined;

    renderList(): void;
}

/** Routine editor sheet (create/edit/delete) and Work Hub routines refresh. */
export class MobileProjectsHubRoutineEditorUi {

    constructor(protected readonly host: MobileProjectsHubRoutineEditorHost) { }

    async refreshWorkHubRoutines(force = false): Promise<void> {
        if (this.host.workHubRoutinesLoading && !force) {
            return;
        }
        this.host.workHubRoutinesLoading = true;
        try {
            const response = await fetchWorkHubRoutines();
            this.host.workHubRoutines = response.routines;
            this.host.workHubRoutinesDefaultAgent = response.defaultAgent;
            this.host.workHubRoutinesLoaded = true;
        } catch {
            if (!this.host.workHubRoutinesLoaded) {
                this.host.workHubRoutines = [];
            }
        } finally {
            this.host.workHubRoutinesLoading = false;
            if (this.host.visible && this.host.hubView === 'routines') {
                this.host.renderList();
            }
        }
    }

    resolveDefaultRoutineCwd(): string {
        const current = this.host.projects.find(p => p.isCurrent);
        const cwd = current ? this.host.projectsService.getProjectCwd(current) : undefined;
        if (cwd) {
            return cwd;
        }
        const withUri = this.host.projects.find(p => p.uri);
        if (withUri?.uri) {
            return withUri.uri.path.toString();
        }
        return '';
    }

    openRoutineEditor(routine?: QaapWorkHubRoutine): void {
        this.closeRoutineEditor();
        this.host.editingRoutineId = routine?.id;
        const sheet = document.createElement('div');
        sheet.className = 'theia-mobile-routine-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-routine-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeRoutineEditor());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-routine-sheet-panel q-sheet';
        panel.addEventListener('click', ev => ev.stopPropagation());
        panel.addEventListener('pointerdown', ev => ev.stopPropagation());

        const handle = document.createElement('div');
        handle.className = 'theia-mobile-routine-sheet-handle';
        handle.setAttribute('aria-hidden', 'true');

        const header = document.createElement('header');
        header.className = 'theia-mobile-routine-sheet-header';
        const heading = document.createElement('h2');
        heading.textContent = routine
            ? nls.localize('qaap/mobileProjects/routineEdit', 'Edit routine')
            : nls.localize('qaap/mobileProjects/routineNew', 'New routine');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-routine-sheet-close q-icon-button codicon codicon-close';
        close.addEventListener('click', () => this.closeRoutineEditor());
        header.append(heading, close);

        const form = document.createElement('div');
        form.className = 'theia-mobile-routine-sheet-form';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'theia-mobile-routine-field';
        titleInput.placeholder = nls.localize('qaap/mobileProjects/routineTitlePlaceholder', 'Title');
        titleInput.value = routine?.title ?? '';

        const promptInput = document.createElement('textarea');
        promptInput.className = 'theia-mobile-routine-field theia-mod-textarea';
        promptInput.placeholder = nls.localize('qaap/mobileProjects/routinePromptPlaceholder', 'What should the VPS agent do?');
        promptInput.value = routine?.prompt ?? '';

        const cwdInput = document.createElement('input');
        cwdInput.type = 'text';
        cwdInput.className = 'theia-mobile-routine-field';
        cwdInput.placeholder = nls.localize('qaap/mobileProjects/routineCwdPlaceholder', 'Working directory (absolute path)');
        cwdInput.value = routine?.cwd ?? this.resolveDefaultRoutineCwd();

        const agentPicker = createAgentPickerField({
            label: nls.localize('qaap/mobileProjects/routineAgent', 'Agent'),
            agents: [],
            selectedId: routine?.agent ?? this.host.workHubRoutinesDefaultAgent ?? QAIQ_AGENT_ID,
        });
        void fetchAgentTaskListAll().then(snapshot => {
            agentPicker.setAgents(filterUiSelectableVpsAgents(snapshot.agents).filter(a => a.available));
            const selected = routine?.agent ?? this.host.workHubRoutinesDefaultAgent ?? QAIQ_AGENT_ID;
            agentPicker.setSelectedId(selected);
        }).catch(() => {
            agentPicker.setAgents([{ id: QAIQ_AGENT_ID, label: 'QAIQ' }]);
            agentPicker.setSelectedId(QAIQ_AGENT_ID);
        });

        const syncScheduleFields = (): void => {
            const trigger = triggerField.getValue();
            const isInterval = trigger === 'interval';
            const isCron = trigger === 'cron';
            intervalInput.hidden = !isInterval;
            for (const el of [cronPresetSelect, cronCustomInput, timezoneInput, oneShotLabel]) {
                (el as HTMLElement).hidden = !isCron;
            }
        };
        const triggerField = createSegmentedField<QaapWorkHubRoutineTrigger>({
            label: nls.localize('qaap/mobileProjects/routineTrigger', 'Schedule'),
            segments: [
                { id: 'manual', label: nls.localize('qaap/mobileProjects/routineTriggerManualShort', 'Manual') },
                { id: 'interval', label: nls.localize('qaap/mobileProjects/routineTriggerIntervalShort', 'Interval') },
                { id: 'cron', label: nls.localize('qaap/mobileProjects/routineTriggerCronShort', 'Cron') },
            ],
            value: routine?.trigger ?? 'manual',
            onChange: () => syncScheduleFields(),
        });

        const intervalInput = document.createElement('input');
        intervalInput.type = 'number';
        intervalInput.min = '1';
        intervalInput.max = '168';
        intervalInput.className = 'theia-mobile-routine-field theia-mod-interval-field';
        intervalInput.placeholder = nls.localize('qaap/mobileProjects/routineIntervalHours', 'Interval (hours)');
        intervalInput.value = String(routine?.intervalHours ?? 24);

        const cronPresetSelect = document.createElement('select');
        cronPresetSelect.className = 'theia-mobile-routine-field theia-mod-cron-field';
        for (const preset of QAAP_ROUTINE_CRON_PRESETS) {
            const option = document.createElement('option');
            option.value = preset.expression;
            option.textContent = preset.label;
            cronPresetSelect.append(option);
        }
        const initialCron = routine?.cronExpression ?? QAAP_ROUTINE_CRON_PRESETS[0].expression;
        cronPresetSelect.value = QAAP_ROUTINE_CRON_PRESETS.some(p => p.expression === initialCron)
            ? initialCron
            : QAAP_ROUTINE_CRON_PRESETS[0].expression;

        const cronCustomInput = document.createElement('input');
        cronCustomInput.type = 'text';
        cronCustomInput.className = 'theia-mobile-routine-field theia-mod-cron-field';
        cronCustomInput.placeholder = nls.localize('qaap/mobileProjects/routineCronExpression', 'Cron expression (min hour dom month dow)');
        cronCustomInput.value = initialCron;

        const timezoneInput = document.createElement('input');
        timezoneInput.type = 'text';
        timezoneInput.className = 'theia-mobile-routine-field theia-mod-cron-field';
        timezoneInput.placeholder = nls.localize('qaap/mobileProjects/routineTimezone', 'Timezone (IANA, e.g. Europe/Madrid)');
        timezoneInput.value = routine?.timezone
            ?? Intl.DateTimeFormat().resolvedOptions().timeZone
            ?? 'UTC';

        const runModeField = createSegmentedField<QaapWorkHubRoutineRunMode>({
            label: nls.localize('qaap/mobileProjects/routineRunMode', 'Session'),
            segments: [
                { id: 'fresh', label: nls.localize('qaap/mobileProjects/routineRunModeFreshShort', 'Fresh') },
                { id: 'continue', label: nls.localize('qaap/mobileProjects/routineRunModeContinueShort', 'Continue') },
            ],
            value: routine?.runMode ?? 'fresh',
        });

        const oneShotLabel = document.createElement('label');
        oneShotLabel.className = 'theia-mobile-routine-enabled theia-mod-cron-field';
        const oneShotInput = document.createElement('input');
        oneShotInput.type = 'checkbox';
        oneShotInput.checked = routine?.oneShot ?? false;
        oneShotLabel.append(oneShotInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineOneShot', 'Run once then disable'),
        ));

        cronPresetSelect.addEventListener('change', () => {
            cronCustomInput.value = cronPresetSelect.value;
        });
        syncScheduleFields();

        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'theia-mobile-routine-enabled';
        const enabledInput = document.createElement('input');
        enabledInput.type = 'checkbox';
        enabledInput.checked = routine?.enabled ?? false;
        enabledLabel.append(enabledInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineEnabled', 'Enabled'),
        ));

        const autoApproveLabel = document.createElement('label');
        autoApproveLabel.className = 'theia-mobile-routine-enabled';
        const autoApproveInput = document.createElement('input');
        autoApproveInput.type = 'checkbox';
        autoApproveInput.checked = routine?.autoApprove !== false;
        autoApproveLabel.append(autoApproveInput, document.createTextNode(
            nls.localize('qaap/mobileProjects/routineAutoApprove', 'Auto-approve tools (YOLO)'),
        ));
        const autoApproveHint = document.createElement('p');
        autoApproveHint.className = 'theia-mobile-routine-field-hint';
        autoApproveHint.textContent = nls.localize(
            'qaap/mobileProjects/routineAutoApproveHint',
            'Keep on for scheduled runs. Turn off only if you will watch the VPS and approve tool calls manually.',
        );

        form.append(
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routineTitle', 'Title')),
            titleInput,
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routinePrompt', 'Prompt')),
            promptInput,
            createFormFieldLabel(nls.localize('qaap/mobileProjects/routineCwd', 'Working directory')),
            cwdInput,
            agentPicker.root,
            triggerField.root,
            intervalInput,
            cronPresetSelect,
            cronCustomInput,
            timezoneInput,
            runModeField.root,
            oneShotLabel,
            enabledLabel,
            autoApproveLabel,
            autoApproveHint,
        );

        const footer = document.createElement('footer');
        footer.className = 'theia-mobile-routine-sheet-footer';
        if (routine) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'theia-mobile-routine-btn theia-mod-danger';
            deleteBtn.textContent = nls.localize('qaap/mobileProjects/routineDelete', 'Delete');
            deleteBtn.addEventListener('click', () => { void this.deleteRoutine(routine.id); });
            footer.append(deleteBtn);
        }
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'theia-mobile-routine-btn theia-mod-primary q-button-primary';
        saveBtn.textContent = nls.localize('qaap/mobileProjects/routineSave', 'Save');
        saveBtn.addEventListener('click', () => {
            const trigger = triggerField.getValue();
            void this.saveRoutineFromEditor({
                id: routine?.id,
                title: titleInput.value,
                prompt: promptInput.value,
                cwd: cwdInput.value,
                agent: agentPicker.getSelectedId(),
                trigger,
                intervalHours: Number(intervalInput.value),
                cronExpression: cronCustomInput.value.trim() || cronPresetSelect.value,
                timezone: timezoneInput.value.trim(),
                oneShot: oneShotInput.checked,
                runMode: runModeField.getValue(),
                enabled: enabledInput.checked,
                autoApprove: autoApproveInput.checked,
            });
        });
        footer.append(saveBtn);

        panel.append(handle, header, form, footer);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.host.routineSheet = sheet;
    }

    closeRoutineEditor(): void {
        this.host.routineSheet?.remove();
        this.host.routineSheet = undefined;
        this.host.editingRoutineId = undefined;
    }

    async saveRoutineFromEditor(fields: {
        id?: string;
        title: string;
        prompt: string;
        cwd: string;
        agent: string;
        trigger: QaapWorkHubRoutineTrigger;
        intervalHours: number;
        cronExpression: string;
        timezone: string;
        oneShot: boolean;
        runMode: QaapWorkHubRoutineRunMode;
        enabled: boolean;
        autoApprove: boolean;
    }): Promise<void> {
        try {
            const payload = {
                title: fields.title,
                prompt: fields.prompt,
                cwd: fields.cwd,
                agent: fields.agent,
                trigger: fields.trigger,
                intervalHours: fields.intervalHours,
                ...(fields.trigger === 'cron' ? {
                    cronExpression: fields.cronExpression,
                    timezone: fields.timezone,
                    oneShot: fields.oneShot,
                } : {}),
                runMode: fields.runMode,
                enabled: fields.enabled,
                autoApprove: fields.autoApprove,
            };
            if (fields.id) {
                await updateWorkHubRoutine(fields.id, payload);
            } else {
                await createWorkHubRoutine(payload);
            }
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/routineSaved', 'Routine saved'),
                { kind: 'success', duration: 1400 },
            );
        } catch (error) {
            this.host.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }

    async deleteRoutine(id: string): Promise<void> {
        try {
            await deleteWorkHubRoutine(id);
            this.closeRoutineEditor();
            await this.refreshWorkHubRoutines(true);
        } catch (error) {
            this.host.messageService?.error(error instanceof Error ? error.message : String(error));
        }
    }
}
