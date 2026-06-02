// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    applyAntigravityModelSetting,
    isAntigravityCliCommand,
    recoverOrphanedAntigravitySettingsBackup,
} from './qaap-antigravity-settings';

describe('qaap-antigravity-settings', () => {
    let tempDir: string;
    let settingsPath: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qaap-antigravity-settings-'));
        settingsPath = path.join(tempDir, 'settings.json');
        process.env.QAAP_ANTIGRAVITY_SETTINGS_PATH = settingsPath;
    });

    afterEach(() => {
        delete process.env.QAAP_ANTIGRAVITY_SETTINGS_PATH;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('isAntigravityCliCommand detects agy, antigravity, and legacy gemini -p', () => {
        expect(isAntigravityCliCommand('agy -p "hi"')).to.equal(true);
        expect(isAntigravityCliCommand('antigravity -p "hi"')).to.equal(true);
        expect(isAntigravityCliCommand('gemini --approval-mode=yolo -p "hi"')).to.equal(true);
        expect(isAntigravityCliCommand('qaiq -p "hi"')).to.equal(false);
    });

    it('writes model to settings and restores on cleanup', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ colorScheme: 'dark', model: 'Gemini 3.5 Flash (High)' }, undefined, 2));

        const override = applyAntigravityModelSetting('Claude Opus 4.6 (Thinking)', settingsPath);
        expect(override).to.not.equal(undefined);

        const during = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { model?: string; colorScheme?: string };
        expect(during.model).to.equal('Claude Opus 4.6 (Thinking)');
        expect(during.colorScheme).to.equal('dark');

        override!.restore();

        const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { model?: string; colorScheme?: string };
        expect(after.model).to.equal('Gemini 3.5 Flash (High)');
        expect(after.colorScheme).to.equal('dark');
        expect(fs.existsSync(`${settingsPath}.qaap-model-backup`)).to.equal(false);
    });

    it('creates settings when missing and removes file on restore', () => {
        const override = applyAntigravityModelSetting('Gemini 3.5 Flash (Medium)', settingsPath);
        expect(override).to.not.equal(undefined);
        expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))).to.deep.equal({ model: 'Gemini 3.5 Flash (Medium)' });

        override!.restore();

        expect(fs.existsSync(settingsPath)).to.equal(false);
    });

    it('skips override when model is already selected', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ model: 'Gemini 3.5 Flash (Medium)' }, undefined, 2));

        expect(applyAntigravityModelSetting('Gemini 3.5 Flash (Medium)', settingsPath)).to.equal(undefined);
    });

    it('recoverOrphanedAntigravitySettingsBackup restores a leftover backup', () => {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify({ model: 'stale' }, undefined, 2));
        fs.writeFileSync(`${settingsPath}.qaap-model-backup`, JSON.stringify({ model: 'original' }, undefined, 2));

        recoverOrphanedAntigravitySettingsBackup(settingsPath);

        expect(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))).to.deep.equal({ model: 'original' });
        expect(fs.existsSync(`${settingsPath}.qaap-model-backup`)).to.equal(false);
    });
});
