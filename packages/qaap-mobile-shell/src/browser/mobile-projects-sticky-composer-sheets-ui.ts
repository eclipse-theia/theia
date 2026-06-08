// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { ChatMode } from '@theia/ai-chat';
import {
    agentSupportsModelPicker,
    agentUsesSettingsModelCatalog,
    fetchAgentModelsForAgent,
    isSameAgentModel,
    isStickyComposerAgentSelected,
    readStoredAgentModel,
    writeStoredAgent,
    writeStoredAgentModel,
    type QaapAgentTaskAgentOption,
    type QaapQaiqModelOption,
} from '../common/qaap-agent-task-client';
import {
    reconcileComposerModeId,
    resolveStickyComposerModes,
    writeStoredComposerMode,
} from '../common/qaap-sticky-composer-mode';
import {
    QAAP_AGENT_APPROVAL_POLICIES,
    reconcileAgentApprovalPolicyId,
    writeStoredAgentApprovalPolicy,
    type QaapAgentApprovalPolicyId,
} from '../common/qaap-sticky-composer-approval-policy';
import {
    reconcileAgentToolApprovalRules,
    writeStoredAgentToolApprovalRules,
    type QaapAgentToolApprovalRules,
} from '../common/qaap-agent-tool-approval-rules';
import {
    createAgentSheetOptionButton,
    createApprovalPolicySheetOptionButton,
    createPickerSheetOptionButton,
    createToolApprovalRuleToggle,
} from './qaap-agent-ui';
import {
    formatQaiqModelProviderLabel,
    groupQaiqModelsByProvider,
    listQaiqModelsFromPreferences,
} from '../common/qaap-qaiq-model-catalog';
import { THEIA_CODER_AGENT_ID } from '../common/qaap-agent-task-client';
import type { MobileProjectEntry } from './mobile-projects-types';
import type { MobileProjectsService } from './mobile-projects-service';
import type { QaapComposerSurface } from '../common/qaap-composer-surface';

export type ComposerAgentPickerView = 'agents' | 'models';

export interface ComposerAgentPickerChrome {
    readonly sheet: HTMLElement;
    readonly header: HTMLElement;
    readonly title: HTMLElement;
    readonly backBtn: HTMLButtonElement;
    readonly list: HTMLElement;
}

export interface MobileProjectsStickyComposerSheetsHost {
stickyComposerAgentSheet: HTMLElement | undefined;
stickyComposerModeSheet: HTMLElement | undefined;
stickyComposerApprovalSheet: HTMLElement | undefined;
stickyComposerWorkspaceSheet: HTMLElement | undefined;
stickyComposerSurface: QaapComposerSurface;
stickyComposerPinnedAgentId: string | undefined;
stickyComposerModeId: string | undefined;
stickyComposerApprovalPolicyId: QaapAgentApprovalPolicyId | undefined;
stickyComposerToolApprovalRules: QaapAgentToolApprovalRules | undefined;
preparedCwdByProjectId: Map<string, string>;
projectsService: MobileProjectsService;
chatAgentService?: import('@theia/ai-chat/lib/common/chat-agent-service').ChatAgentService;
    readPreference?: (key: string) => unknown;
    renderStickyComposer(): void;
    ensureStickyComposerAgentsLoaded(project: MobileProjectEntry): Promise<readonly QaapAgentTaskAgentOption[]>;
    showComposerAgentPickerLoading(chrome: ComposerAgentPickerChrome): void;
    getOfferableCoderAgent(): import('@theia/ai-chat').ChatAgent | undefined;
closeTranscriptComposerSheets(): void;
agentsHubShellActive?: boolean;
}

export class MobileProjectsStickyComposerSheetsUi {
    constructor(protected readonly host: MobileProjectsStickyComposerSheetsHost) { }

    protected shouldElevateComposerSheets(): boolean {
        return this.host.agentsHubShellActive === true
            || document.body.classList.contains('theia-mobile-mod-workhub-composer-header')
            || document.body.classList.contains('theia-mobile-mod-workhub-no-bottom-chrome');
    }

    closeStickyComposerSheets(): void {
        if (this.host.stickyComposerAgentSheet) {
            this.host.stickyComposerAgentSheet.remove();
            this.host.stickyComposerAgentSheet = undefined;
        }
        if (this.host.stickyComposerModeSheet) {
            this.host.stickyComposerModeSheet.remove();
            this.host.stickyComposerModeSheet = undefined;
        }
        if (this.host.stickyComposerApprovalSheet) {
            this.host.stickyComposerApprovalSheet.remove();
            this.host.stickyComposerApprovalSheet = undefined;
        }
        if (this.host.stickyComposerWorkspaceSheet) {
            this.host.stickyComposerWorkspaceSheet.remove();
            this.host.stickyComposerWorkspaceSheet = undefined;
        }
    }

    closeAllComposerSheets(): void {
        this.closeStickyComposerSheets();
        this.host.closeTranscriptComposerSheets();
    }
    openStickyComposerAgentSheet(project: MobileProjectEntry): void {
        if (this.host.stickyComposerSurface === 'chat') {
            return;
        }
        this.closeAllComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        const chrome = this.createComposerAgentPickerChrome({
            sheetClassName: this.shouldElevateComposerSheets()
                ? 'theia-mobile-sticky-composer-sheet theia-mod-agent theia-mod-transcript-overlay'
                : 'theia-mobile-sticky-composer-sheet theia-mod-agent',
            closeTitle: nls.localize('qaap/mobileAgentComposer/close', 'Close'),
            onClose: () => this.closeAllComposerSheets(),
        });
        document.body.append(chrome.sheet);
        this.host.stickyComposerAgentSheet = chrome.sheet;
        this.host.showComposerAgentPickerLoading(chrome);
        void this.host.ensureStickyComposerAgentsLoaded(project).then(agents => {
            if (this.host.stickyComposerAgentSheet !== chrome.sheet) {
                return;
            }
            void this.renderComposerAgentPicker(chrome, {
                view: 'agents',
                cwd,
                agents,
                selectedAgentId: this.host.stickyComposerPinnedAgentId,
                includeCoder: true,
                onSelectAgent: (agentId, model) => {
                    this.host.stickyComposerPinnedAgentId = agentId;
                    if (cwd) {
                        writeStoredAgent(cwd, agentId);
                        if (model) {
                            writeStoredAgentModel(cwd, agentId, model);
                        }
                    }
                    const modes = resolveStickyComposerModes(agentId, this.host.chatAgentService);
                    this.host.stickyComposerModeId = reconcileComposerModeId(undefined, modes, cwd);
                    if (cwd && this.host.stickyComposerModeId) {
                        writeStoredComposerMode(cwd, this.host.stickyComposerModeId);
                    }
                    this.closeAllComposerSheets();
                    this.host.renderStickyComposer();
                },
            });
        });
    }
    openStickyComposerModeSheet(project: MobileProjectEntry, modes: readonly ChatMode[]): void {
        this.closeAllComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        const sheet = document.createElement('div');
        sheet.className = this.shouldElevateComposerSheets()
            ? 'theia-mobile-sticky-composer-sheet theia-mod-mode theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-mode';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => this.closeAllComposerSheets());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickMode', 'Choose mode');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => this.closeAllComposerSheets());
        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';
        for (const mode of modes) {
            list.append(this.createModeSheetOption(
                mode.name,
                mode.id,
                this.host.stickyComposerModeId,
                id => {
                    this.host.stickyComposerModeId = id;
                    if (cwd) {
                        writeStoredComposerMode(cwd, id);
                    }
                    this.closeAllComposerSheets();
                    this.host.renderStickyComposer();
                },
            ));
        }

        panel.append(header, list);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        this.host.stickyComposerModeSheet = sheet;
    }
    openStickyComposerApprovalPolicySheet(project: MobileProjectEntry, agentLabel: string): void {
        this.closeAllComposerSheets();
        const cwd = this.host.projectsService.getProjectCwd(project) ?? this.host.preparedCwdByProjectId.get(project.id);
        this.openApprovalPolicySheet({
            agentLabel,
            cwd,
            transcriptOverlay: this.shouldElevateComposerSheets(),
            selectedId: reconcileAgentApprovalPolicyId(this.host.stickyComposerApprovalPolicyId, cwd),
            toolRules: reconcileAgentToolApprovalRules(
                reconcileAgentApprovalPolicyId(this.host.stickyComposerApprovalPolicyId, cwd),
                cwd,
                this.host.stickyComposerToolApprovalRules,
            ),
            onSelect: policyId => {
                this.host.stickyComposerApprovalPolicyId = policyId;
                this.host.stickyComposerToolApprovalRules = reconcileAgentToolApprovalRules(
                    policyId,
                    cwd,
                    this.host.stickyComposerToolApprovalRules,
                );
                if (cwd) {
                    writeStoredAgentApprovalPolicy(cwd, policyId);
                    writeStoredAgentToolApprovalRules(cwd, this.host.stickyComposerToolApprovalRules);
                }
                this.closeAllComposerSheets();
                this.host.renderStickyComposer();
            },
            onToolRulesChange: rules => {
                this.host.stickyComposerToolApprovalRules = rules;
                if (cwd) {
                    writeStoredAgentToolApprovalRules(cwd, rules);
                }
            },
            onClose: () => this.closeAllComposerSheets(),
            assignSheet: sheet => { this.host.stickyComposerApprovalSheet = sheet; },
        });
    }
    openApprovalPolicySheet(options: {
        readonly agentLabel: string;
        readonly cwd: string | undefined;
        readonly selectedId: QaapAgentApprovalPolicyId;
        readonly toolRules: QaapAgentToolApprovalRules;
        /** Raise above the full-screen transcript overlay (z-index 2147483001). */
        readonly transcriptOverlay?: boolean;
        readonly onSelect: (policyId: QaapAgentApprovalPolicyId) => void;
        readonly onToolRulesChange?: (rules: QaapAgentToolApprovalRules) => void;
        readonly onClose: () => void;
        readonly assignSheet: (sheet: HTMLElement) => void;
    }): void {
        const sheet = document.createElement('div');
        sheet.className = options.transcriptOverlay
            ? 'theia-mobile-sticky-composer-sheet theia-mod-approval-policy theia-mod-transcript-overlay'
            : 'theia-mobile-sticky-composer-sheet theia-mod-approval-policy';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', () => options.onClose());

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';

        const title = document.createElement('h2');
        title.textContent = nls.localize(
            'qaap/mobileProjects/approvalPolicySheetTitle',
            'How should {0} actions be approved?',
            options.agentLabel,
        );

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = nls.localize('qaap/mobileAgentComposer/close', 'Close');
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => options.onClose());

        header.append(title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list theia-qaap-approval-policy-sheet-list';
        let selectedId = options.selectedId;
        let toolRules = { ...options.toolRules };
        const toolRulesSection = document.createElement('div');
        toolRulesSection.className = 'theia-mobile-sticky-composer-sheet-list theia-qaap-tool-approval-rules-list';
        const renderToolRules = (): void => {
            toolRulesSection.replaceChildren();
            if (selectedId !== 'approve-for-me' || !options.onToolRulesChange) {
                toolRulesSection.hidden = true;
                return;
            }
            toolRulesSection.hidden = false;
            const heading = document.createElement('div');
            heading.className = 'theia-qaap-tool-approval-rules-heading';
            heading.textContent = nls.localize(
                'qaap/mobileProjects/approvalToolRulesHeading',
                'Also auto-approve',
            );
            toolRulesSection.append(
                heading,
                createToolApprovalRuleToggle({
                    label: nls.localize('qaap/mobileProjects/approvalToolShell', 'Terminal commands'),
                    description: nls.localize(
                        'qaap/mobileProjects/approvalToolShellHint',
                        'Shell, git, package installs, and other command execution.',
                    ),
                    checked: toolRules.shell === true,
                    onChange: checked => {
                        toolRules = { ...toolRules, shell: checked };
                        options.onToolRulesChange?.(toolRules);
                    },
                }),
                createToolApprovalRuleToggle({
                    label: nls.localize('qaap/mobileProjects/approvalToolNetwork', 'Network access'),
                    description: nls.localize(
                        'qaap/mobileProjects/approvalToolNetworkHint',
                        'Web fetch, external APIs, and other off-machine access.',
                    ),
                    checked: toolRules.network === true,
                    onChange: checked => {
                        toolRules = { ...toolRules, network: checked };
                        options.onToolRulesChange?.(toolRules);
                    },
                }),
            );
        };
        const policyButtons: HTMLButtonElement[] = [];
        for (const policy of QAAP_AGENT_APPROVAL_POLICIES) {
            const button = createApprovalPolicySheetOptionButton({
                policy,
                selected: policy.id === selectedId,
                onSelect: () => {
                    selectedId = policy.id;
                    toolRules = reconcileAgentToolApprovalRules(selectedId, options.cwd, toolRules);
                    for (const entry of policyButtons) {
                        entry.classList.remove('theia-mod-selected');
                    }
                    button.classList.add('theia-mod-selected');
                    renderToolRules();
                    options.onSelect(selectedId);
                    if (selectedId === 'approve-for-me') {
                        options.onToolRulesChange?.(toolRules);
                    }
                },
            });
            policyButtons.push(button);
            list.append(button);
        }
        renderToolRules();

        panel.append(header, list, toolRulesSection);
        sheet.append(backdrop, panel);
        document.body.append(sheet);
        options.assignSheet(sheet);
    }
    createModeSheetOption(
        label: string,
        modeId: string,
        selectedModeId: string | undefined,
        onSelect: (modeId: string) => void,
    ): HTMLElement {
        return createPickerSheetOptionButton({
            label,
            selected: selectedModeId === modeId,
            onSelect: () => {
                onSelect(modeId);
            },
        });
    }
    createAgentSheetOption(
        label: string,
        agentId: string,
        cwd: string | undefined,
        selectedAgentId: string | undefined,
        onSelect: (agentId: string) => void,
    ): HTMLElement {
        return createAgentSheetOptionButton({
            agentId,
            label,
            selected: isStickyComposerAgentSelected(agentId, selectedAgentId, cwd),
            onSelect: () => onSelect(agentId),
        });
    }
    async resolveModelsForAgentPicker(agentId: string): Promise<QaapQaiqModelOption[]> {
        if (agentUsesSettingsModelCatalog(agentId)) {
            return this.host.readPreference
                ? listQaiqModelsFromPreferences(this.host.readPreference)
                : [];
        }
        try {
            return await fetchAgentModelsForAgent(agentId);
        } catch {
            return [];
        }
    }
    createComposerAgentPickerChrome(options: {
        readonly sheetClassName: string;
        readonly closeTitle: string;
        readonly onClose: () => void;
    }): ComposerAgentPickerChrome {
        const sheet = document.createElement('div');
        sheet.className = options.sheetClassName;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const backdrop = document.createElement('div');
        backdrop.className = 'theia-mobile-sticky-composer-sheet-backdrop';
        backdrop.addEventListener('click', options.onClose);

        const panel = document.createElement('section');
        panel.className = 'theia-mobile-sticky-composer-sheet-panel';

        const header = document.createElement('header');
        header.className = 'theia-mobile-sticky-composer-sheet-header';

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.className = 'theia-mobile-sticky-composer-sheet-back codicon codicon-arrow-left';
        backBtn.hidden = true;
        backBtn.title = nls.localize('qaap/mobileProjects/backToAgents', 'Back to agents');
        backBtn.setAttribute('aria-label', backBtn.title);

        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'theia-mobile-sticky-composer-sheet-close codicon codicon-close';
        close.title = options.closeTitle;
        close.setAttribute('aria-label', options.closeTitle);
        close.addEventListener('click', options.onClose);

        header.append(backBtn, title, close);

        const list = document.createElement('div');
        list.className = 'theia-mobile-sticky-composer-sheet-list';

        panel.append(header, list);
        sheet.append(backdrop, panel);

        return { sheet, header, title, backBtn, list };
    }
    async renderComposerAgentPicker(
        chrome: ComposerAgentPickerChrome,
        options: {
            readonly view: ComposerAgentPickerView;
            readonly modelPickerAgentId?: string;
            readonly cwd: string | undefined;
            readonly agents: readonly QaapAgentTaskAgentOption[];
            readonly selectedAgentId: string | undefined;
            readonly includeCoder: boolean;
            readonly onSelectAgent: (agentId: string, model?: QaapQaiqModelOption) => void;
        },
    ): Promise<void> {
        chrome.list.replaceChildren();
        if (options.view === 'models' && options.modelPickerAgentId) {
            const modelAgentId = options.modelPickerAgentId;
            const pickerModels = await this.resolveModelsForAgentPicker(modelAgentId);
            const storedModel = readStoredAgentModel(options.cwd, modelAgentId);
            chrome.header.classList.add('theia-mod-drilldown');
            chrome.backBtn.hidden = false;
            chrome.title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickModel', 'Choose model');
            chrome.backBtn.onclick = () => {
                void this.renderComposerAgentPicker(chrome, { ...options, view: 'agents', modelPickerAgentId: undefined });
            };
            this.appendAgentModelPickerList(chrome.list, modelAgentId, pickerModels, storedModel, model => {
                options.onSelectAgent(modelAgentId, model);
            });
            return;
        }

        chrome.header.classList.remove('theia-mod-drilldown');
        chrome.backBtn.hidden = true;
        chrome.backBtn.onclick = null;
        chrome.title.textContent = nls.localize('qaap/mobileProjects/stickyComposerPickAgent', 'Choose agent');

        const appendAgent = (agentId: string, label: string): void => {
            const hasModels = agentSupportsModelPicker(agentId);
            const agentSelected = isStickyComposerAgentSelected(agentId, options.selectedAgentId, options.cwd);
            const storedModel = readStoredAgentModel(options.cwd, agentId);
            let displayLabel = label;
            if (storedModel?.modelId && agentSelected) {
                displayLabel = `${label} · ${storedModel.modelId}`;
            }
            chrome.list.append(createAgentSheetOptionButton({
                agentId,
                label: displayLabel,
                selected: agentSelected,
                submenuChevron: hasModels ? 'forward' : undefined,
                onSelect: async () => {
                    const models = await this.resolveModelsForAgentPicker(agentId);
                    if (models.length > 0) {
                        void this.renderComposerAgentPicker(chrome, {
                            ...options,
                            view: 'models',
                            modelPickerAgentId: agentId,
                        });
                        return;
                    }
                    options.onSelectAgent(agentId);
                },
            }));
        };

        if (options.includeCoder) {
            const coder = this.host.getOfferableCoderAgent();
            if (coder) {
                appendAgent(THEIA_CODER_AGENT_ID, coder.name);
            }
        }
        for (const agent of options.agents) {
            appendAgent(agent.id, agent.label);
        }
        if (chrome.list.childElementCount === 0) {
            const hint = document.createElement('p');
            hint.className = 'theia-qaap-agent-sheet-empty-models';
            hint.textContent = nls.localize(
                'qaap/mobileProjects/stickyComposerNoAgents',
                'No agents are available. Check your workspace server connection or AI configuration.',
            );
            chrome.list.append(hint);
        }
    }
    appendAgentModelPickerList(
        list: HTMLElement,
        agentId: string,
        models: readonly QaapQaiqModelOption[],
        storedModel: ReturnType<typeof readStoredAgentModel>,
        onSelect: (model: QaapQaiqModelOption) => void,
    ): void {
        if (models.length === 0) {
            const hint = document.createElement('p');
            hint.className = 'theia-qaap-agent-sheet-empty-models';
            hint.textContent = agentUsesSettingsModelCatalog(agentId)
                ? nls.localize(
                    'qaap/mobileProjects/stickyComposerNoQaiqModels',
                    'Add an API key in Settings → AI Features to choose a model.',
                )
                : nls.localize(
                    'qaap/mobileProjects/stickyComposerNoAgentModels',
                    'No models are available for this agent on the workspace.',
                );
            list.append(hint);
            return;
        }
        for (const [vendor, providerModels] of groupQaiqModelsByProvider(models)) {
            const section = document.createElement('div');
            section.className = 'theia-qaap-agent-sheet-provider';
            const label = document.createElement('div');
            label.className = 'theia-qaap-agent-sheet-provider-label';
            label.textContent = formatQaiqModelProviderLabel(vendor);
            section.append(label);
            for (const model of providerModels) {
                section.append(createPickerSheetOptionButton({
                    label: model.label || model.modelId,
                    selected: isSameAgentModel(storedModel, model),
                    onSelect: () => onSelect(model),
                }));
            }
            list.append(section);
        }
    }
}

