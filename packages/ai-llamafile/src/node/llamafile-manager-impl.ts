// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { LanguageModelRegistry, LanguageModelStatus } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LlamafileLanguageModel } from '../common/llamafile-language-model';
import { LlamafileManager, LlamafileModelDescription, LlamafileServerManagerClient } from '../common/llamafile-manager';

@injectable()
export class LlamafileManagerImpl implements LlamafileManager {

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    private processMap: Map<string, ChildProcessWithoutNullStreams> = new Map();
    private client: LlamafileServerManagerClient;

    async addLanguageModels(LlamafileModelDescriptions: LlamafileModelDescription[]): Promise<void> {
        for (const llamafile of LlamafileModelDescriptions) {
            const model = await this.languageModelRegistry.getLanguageModel(llamafile.name);
            if (model) {
                if (!(model instanceof LlamafileLanguageModel)) {
                    console.warn(`Llamafile: model ${model.id} is not a Llamafile model`);
                    continue;
                } else {
                    // This can happen during the initializing of more than one frontends, changes are handled in the frontend
                    console.info(`Llamafile: skip creating or updating model ${llamafile.name} because it already exists.`);
                }
            } else {
                this.languageModelRegistry.addLanguageModels([
                    new LlamafileLanguageModel(
                        llamafile.name,
                        this.calculateStatus(false),
                        llamafile.uri,
                        llamafile.port
                    )
                ]);
            }
        }
    }

    removeLanguageModels(modelIds: string[]): void {
        modelIds.filter(modelId => this.isStarted(modelId)).forEach(modelId => this.stopServer(modelId));
        this.languageModelRegistry.removeLanguageModels(modelIds);
    }

    async getStartedLlamafiles(): Promise<string[]> {
        const models = await this.languageModelRegistry.getLanguageModels();
        return models.filter(model => model instanceof LlamafileLanguageModel && this.isStarted(model.name)).map(model => model.id);
    }

    async startServer(name: string): Promise<void> {
        if (this.processMap.has(name)) {
            return;
        }

        const llm = await this.getLlamafileModel(name);
        if (!llm) {
            return Promise.reject(`Llamafile ${name} not found`);
        }

        const currentProcess = this.spawnLlamafileProcess(llm);
        this.processMap.set(name, currentProcess);
        await this.updateLanguageModelStatus(name, true);
        this.attachProcessHandlers(name, currentProcess);
    }

    protected async getLlamafileModel(name: string): Promise<LlamafileLanguageModel | undefined> {
        const models = await this.languageModelRegistry.getLanguageModels();
        return models.find(model => model.id === name && model instanceof LlamafileLanguageModel) as LlamafileLanguageModel | undefined;
    }

    protected spawnLlamafileProcess(llm: LlamafileLanguageModel): ChildProcessWithoutNullStreams {
        const filePath = fileURLToPath(llm.uri);
        const dir = dirname(filePath);
        const fileName = basename(filePath);
        return spawn(`./${fileName}`, ['--port', '' + llm.port, '--server', '--nobrowser'], { cwd: dir });
    }

    protected attachProcessHandlers(name: string, currentProcess: ChildProcessWithoutNullStreams): void {
        currentProcess.stdout.on('data', (data: Buffer) => {
            this.client.log(name, data.toString());
        });

        currentProcess.stderr.on('data', (data: Buffer) => {
            this.client.error(name, data.toString());
        });

        currentProcess.on('close', code => {
            this.client.log(name, `LlamaFile process for file ${name} exited with code ${code}`);
            this.processMap.delete(name);
            // Set status to 'unavailable' when server stops
            this.updateLanguageModelStatus(name, false);
        });

        currentProcess.on('error', error => {
            this.client.error(name, `Error starting LlamaFile process for file ${name}: ${error.message}`);
            this.processMap.delete(name);
            // Set status to 'unavailable' on error
            this.updateLanguageModelStatus(name, false, error.message);
        });
    }

    protected async updateLanguageModelStatus(modelId: string, hasStarted: boolean, message?: string): Promise<void> {
        const status: LanguageModelStatus = this.calculateStatus(hasStarted, message);
        await this.languageModelRegistry.patchLanguageModel<LlamafileLanguageModel>(modelId, {
            status
        });
    }

    protected calculateStatus(started: boolean, message?: string): LanguageModelStatus {
        if (started) {
            return { status: 'ready' };
        } else {
            return { status: 'unavailable', message: message || 'Llamafile server is not running' };
        }
    }

    stopServer(name: string): void {
        if (this.processMap.has(name)) {
            const currentProcess = this.processMap.get(name);
            currentProcess!.kill();
            this.processMap.delete(name);
            // Set status to 'unavailable' when server is stopped
            this.updateLanguageModelStatus(name, false);
        }
    }

    isStarted(name: string): boolean {
        return this.processMap.has(name);
    }

    setClient(client: LlamafileServerManagerClient): void {
        this.client = client;
    }

}
