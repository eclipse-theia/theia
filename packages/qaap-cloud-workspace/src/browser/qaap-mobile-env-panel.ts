// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import type { QaapDeployEnvVar } from '../common/qaap-cloud-api-types';
import { fetchQaapDeployEnv, saveQaapDeployEnv } from './qaap-cloud-workspace-client';

export class QaapMobileEnvPanel {

    protected readonly root: HTMLElement;
    protected visible = false;
    protected vars: QaapDeployEnvVar[] = [];
    protected readonly list: HTMLElement;

    constructor(
        protected readonly workspace: WorkspaceService,
        protected readonly parent: HTMLElement,
    ) {
        this.root = document.createElement('div');
        this.root.className = 'qaap-mobile-env-panel';
        this.root.hidden = true;

        const backdrop = document.createElement('div');
        backdrop.className = 'qaap-mobile-env-panel-backdrop';
        backdrop.addEventListener('click', () => this.hide());

        const sheet = document.createElement('section');
        sheet.className = 'qaap-mobile-env-panel-sheet';

        const header = document.createElement('header');
        header.className = 'qaap-mobile-env-panel-header';
        const title = document.createElement('h2');
        title.textContent = nls.localize('qaap/mobileEnv/title', 'Deploy environment');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'codicon codicon-close';
        close.addEventListener('click', () => this.hide());
        header.append(title, close);

        const hint = document.createElement('p');
        hint.className = 'qaap-mobile-env-panel-hint';
        hint.textContent = nls.localize(
            'qaap/mobileEnv/hint',
            'Secrets for Vercel / Cloudflare deploy tools (stored on the Qaap backend for this workspace).'
        );

        this.list = document.createElement('div');
        this.list.className = 'qaap-mobile-env-panel-list';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'qaap-mobile-env-panel-add';
        addBtn.textContent = nls.localize('qaap/mobileEnv/add', 'Add variable');
        addBtn.addEventListener('click', () => this.addRow());

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'qaap-mobile-env-panel-save';
        saveBtn.textContent = nls.localize('qaap/mobileEnv/save', 'Save');
        saveBtn.addEventListener('click', () => { void this.save(); });

        sheet.append(header, hint, this.list, addBtn, saveBtn);
        this.root.append(backdrop, sheet);
        this.parent.appendChild(this.root);
    }

    async show(): Promise<void> {
        this.vars = await fetchQaapDeployEnv(this.workspaceKey());
        if (this.vars.length === 0) {
            this.vars = [
                { key: 'VERCEL_TOKEN', value: '' },
                { key: 'CLOUDFLARE_API_TOKEN', value: '' },
            ];
        }
        this.render();
        this.root.hidden = false;
        void this.root.offsetWidth;
        this.root.classList.add('qaap-mod-visible');
        this.visible = true;
    }

    hide(): void {
        this.visible = false;
        this.root.classList.remove('qaap-mod-visible');
        this.root.hidden = true;
    }

    protected workspaceKey(): string {
        const uri = this.workspace.workspace?.resource?.toString();
        return uri ? `ws:${uri}` : 'default';
    }

    protected render(): void {
        this.list.replaceChildren();
        this.vars.forEach((row, index) => this.list.append(this.createRow(row, index)));
    }

    protected createRow(row: QaapDeployEnvVar, index: number): HTMLElement {
        const el = document.createElement('div');
        el.className = 'qaap-mobile-env-panel-row';
        const key = document.createElement('input');
        key.className = 'qaap-mobile-env-panel-key';
        key.placeholder = 'KEY';
        key.value = row.key;
        key.addEventListener('input', () => { this.vars[index] = { ...this.vars[index], key: key.value }; });
        const value = document.createElement('input');
        value.className = 'qaap-mobile-env-panel-value';
        value.placeholder = 'value';
        value.type = 'password';
        value.value = row.value;
        value.addEventListener('input', () => { this.vars[index] = { ...this.vars[index], value: value.value }; });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'codicon codicon-trash';
        del.addEventListener('click', () => {
            this.vars.splice(index, 1);
            this.render();
        });
        el.append(key, value, del);
        return el;
    }

    protected addRow(): void {
        this.vars.push({ key: '', value: '' });
        this.render();
    }

    protected async save(): Promise<void> {
        this.vars = await saveQaapDeployEnv(this.workspaceKey(), this.vars.filter(v => v.key.trim()));
        this.render();
        this.hide();
    }
}
