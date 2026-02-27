// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { injectable } from '@theia/core/shared/inversify';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import { ShellExecutionServer, ShellExecutionRequest, ShellExecutionResult } from '../common/shell-execution-server';

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_TIMEOUT = 600000;     // 10 minutes
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

@injectable()
export class ShellExecutionServerImpl implements ShellExecutionServer {

    protected readonly runningProcesses = new Map<string, ChildProcess>();
    protected readonly canceledExecutions = new Set<string>();

    async execute(request: ShellExecutionRequest): Promise<ShellExecutionResult> {
        const { command, cwd, workspaceRoot, timeout, executionId } = request;
        const effectiveTimeout = Math.min(timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT);
        const startTime = Date.now();

        const resolvedCwd = this.resolveCwd(cwd, workspaceRoot);

        return new Promise<ShellExecutionResult>(resolve => {
            let stdout = '';
            let stderr = '';
            let stdoutCapped = false;
            let stderrCapped = false;
            let killed = false;

            const childProcess = spawn(command, [], {
                cwd: resolvedCwd,
                shell: true,
                detached: process.platform !== 'win32',
                windowsHide: true,
                env: process.env,
            });

            if (executionId) {
                this.runningProcesses.set(executionId, childProcess);
            }

            childProcess.stdout?.on('data', (data: Buffer) => {
                if (stdout.length < MAX_OUTPUT_SIZE) {
                    stdout += data.toString();
                } else {
                    stdoutCapped = true;
                }
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                if (stderr.length < MAX_OUTPUT_SIZE) {
                    stderr += data.toString();
                } else {
                    stderrCapped = true;
                }
            });

            const timeoutId = setTimeout(() => {
                killed = true;
                this.killProcessTree(childProcess);
            }, effectiveTimeout);

            childProcess.on('close', (code, signal) => {
                clearTimeout(timeoutId);

                if (executionId) {
                    this.runningProcesses.delete(executionId);
                }

                const duration = Date.now() - startTime;
                const wasCanceledByUser = executionId ? this.canceledExecutions.has(executionId) : false;
                if (executionId) {
                    this.canceledExecutions.delete(executionId);
                }

                const capped = {
                    stdoutCapped: stdoutCapped || undefined,
                    stderrCapped: stderrCapped || undefined,
                };

                if (signal || killed) {
                    if (wasCanceledByUser) {
                        resolve({
                            success: false,
                            exitCode: undefined,
                            stdout,
                            stderr,
                            error: 'Command canceled by user',
                            duration,
                            canceled: true,
                            resolvedCwd,
                            ...capped,
                        });
                    } else {
                        resolve({
                            success: false,
                            exitCode: undefined,
                            stdout,
                            stderr,
                            error: `Command timed out after ${effectiveTimeout}ms`,
                            duration,
                            resolvedCwd,
                            ...capped,
                        });
                    }
                } else if (code === 0) {
                    resolve({
                        success: true,
                        exitCode: 0,
                        stdout,
                        stderr,
                        duration,
                        resolvedCwd,
                        ...capped,
                    });
                } else {
                    resolve({
                        success: false,
                        exitCode: code ?? undefined,
                        stdout,
                        stderr,
                        duration,
                        resolvedCwd,
                        ...capped,
                    });
                }
            });

            childProcess.on('error', (error: Error) => {
                clearTimeout(timeoutId);

                if (executionId) {
                    this.runningProcesses.delete(executionId);
                    this.canceledExecutions.delete(executionId);
                }

                resolve({
                    success: false,
                    exitCode: undefined,
                    stdout,
                    stderr,
                    error: error.message,
                    duration: Date.now() - startTime,
                    resolvedCwd,
                    stdoutCapped: stdoutCapped || undefined,
                    stderrCapped: stderrCapped || undefined,
                });
            });
        });
    }

    async cancel(executionId: string): Promise<boolean> {
        const childProcess = this.runningProcesses.get(executionId);
        if (childProcess) {
            this.canceledExecutions.add(executionId);
            this.killProcessTree(childProcess);
            this.runningProcesses.delete(executionId);
            return true;
        }
        return false;
    }

    protected killProcessTree(childProcess: ChildProcess): void {
        if (!childProcess.pid) {
            return;
        }

        try {
            if (process.platform === 'win32') {
                execSync(`taskkill /pid ${childProcess.pid} /T /F`, { stdio: 'ignore' });
            } else {
                process.kill(-childProcess.pid, 'SIGTERM');
            }
        } catch {
            try {
                childProcess.kill('SIGKILL');
            } catch {
                // Process may already be dead
            }
        }
    }

    protected resolveCwd(requestedCwd: string | undefined, workspaceRoot: string | undefined): string | undefined {
        if (!requestedCwd) {
            return workspaceRoot;
        }
        if (path.isAbsolute(requestedCwd)) {
            return requestedCwd;
        }
        if (workspaceRoot) {
            return path.resolve(workspaceRoot, requestedCwd);
        }
        return requestedCwd;
    }
}
