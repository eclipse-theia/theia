// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SETTINGS_BACKUP_SUFFIX = '.qaap-model-backup';

/** Override in tests via {@link QAAP_ANTIGRAVITY_SETTINGS_PATH}. */
export function resolveAntigravityCliSettingsPath(): string {
    const override = process.env.QAAP_ANTIGRAVITY_SETTINGS_PATH?.trim();
    if (override) {
        return override;
    }
    return path.join(os.homedir(), '.gemini', 'antigravity-cli', 'settings.json');
}

export function isAntigravityCliCommand(command: string): boolean {
    return /\b(agy|antigravity)\b/.test(command)
        || /\bgemini\b/.test(command) && /\s-p(?:\s|$)/.test(command);
}

export interface AntigravitySettingsOverride {
    readonly restore: () => void;
}

function readSettingsObject(settingsPath: string): Record<string, unknown> {
    if (!fs.existsSync(settingsPath)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
}

function writeSettingsObject(settingsPath: string, settings: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, undefined, 2)}\n`, 'utf8');
}

/** Restore settings left behind when a prior task exited without calling {@link restore}. */
export function recoverOrphanedAntigravitySettingsBackup(settingsPath = resolveAntigravityCliSettingsPath()): void {
    const backupPath = `${settingsPath}${SETTINGS_BACKUP_SUFFIX}`;
    if (!fs.existsSync(backupPath)) {
        return;
    }
    try {
        fs.copyFileSync(backupPath, settingsPath);
        fs.unlinkSync(backupPath);
    } catch {
        /* best effort */
    }
}

/**
 * Temporarily set the Antigravity CLI model label in settings.json for headless `-p` runs.
 * agy has no `--model` flag; it reads the `"model"` field from settings instead.
 */
export function applyAntigravityModelSetting(
    modelLabel: string,
    settingsPath = resolveAntigravityCliSettingsPath(),
): AntigravitySettingsOverride | undefined {
    const trimmed = modelLabel.trim();
    if (!trimmed) {
        return undefined;
    }
    recoverOrphanedAntigravitySettingsBackup(settingsPath);
    const backupPath = `${settingsPath}${SETTINGS_BACKUP_SUFFIX}`;
    try {
        const hadFile = fs.existsSync(settingsPath);
        const settings = hadFile ? readSettingsObject(settingsPath) : {};
        const previousModel = typeof settings.model === 'string' ? settings.model : undefined;
        if (previousModel === trimmed) {
            return undefined;
        }
        if (hadFile) {
            fs.copyFileSync(settingsPath, backupPath);
        }
        writeSettingsObject(settingsPath, { ...settings, model: trimmed });
        return {
            restore: () => restoreAntigravityModelSetting(settingsPath, backupPath, hadFile, previousModel),
        };
    } catch {
        return undefined;
    }
}

function restoreAntigravityModelSetting(
    settingsPath: string,
    backupPath: string,
    hadFile: boolean,
    previousModel: string | undefined,
): void {
    try {
        if (hadFile && fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, settingsPath);
            fs.unlinkSync(backupPath);
            return;
        }
        if (!hadFile) {
            if (fs.existsSync(settingsPath)) {
                fs.unlinkSync(settingsPath);
            }
            return;
        }
        const settings = readSettingsObject(settingsPath);
        if (previousModel === undefined) {
            delete settings.model;
        } else {
            settings.model = previousModel;
        }
        writeSettingsObject(settingsPath, settings);
    } catch {
        /* best effort */
    }
}
