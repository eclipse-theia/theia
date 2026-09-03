// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DeviceCodeResponse } from '../common/copilot-auth-service';
import { CopilotCliAuthProvider } from './copilot-cli-auth-provider';

class TestableCopilotCliAuthProvider extends CopilotCliAuthProvider {
    constructor() {
        super();
        // The logger is injected in production, and read-only for everyone else.
        Object.assign(this, { logger: new MockLogger() });
    }

    callParseDeviceCode(output: string): DeviceCodeResponse | undefined {
        return this.parseDeviceCode(output);
    }

    callFindStoredToken(home: string): Promise<string | undefined> {
        return this.findStoredToken(home);
    }

    callFindTokenInText(text: string): string | undefined {
        return this.findTokenInText(text);
    }

    callParseAccountLabel(output: string): string | undefined {
        return this.parseAccountLabel(output);
    }

    callCreateLoginEnv(home: string, noopBrowser: string): Record<string, string | undefined> {
        return this.createLoginEnv(home, noopBrowser);
    }

    callExtractFailure(output: string): string | undefined {
        return this.extractFailure(output);
    }

    callToHostUrl(enterpriseUrl: string): string {
        return this.toHostUrl(enterpriseUrl);
    }

    setLoginResult(result: Deferred<boolean>): void {
        Object.assign(this, { loginResult: result });
    }
}

describe('CopilotCliAuthProvider - parseDeviceCode', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should extract from the output format of the current CLI', () => {
        const parsed = provider.callParseDeviceCode(
            'To authenticate, visit https://github.com/login/device and enter code B54F-40A3\nWaiting for authorization...\n'
        );
        expect(parsed?.verification_uri).to.equal('https://github.com/login/device');
        expect(parsed?.user_code).to.equal('B54F-40A3');
    });

    it('should extract the verification URL and the user code', () => {
        const parsed = provider.callParseDeviceCode(
            'Please enter the code AAEB-CD8C at https://github.com/login/device to authenticate.\n'
        );
        expect(parsed?.verification_uri).to.equal('https://github.com/login/device');
        expect(parsed?.user_code).to.equal('AAEB-CD8C');
    });

    it('should extract from output spread across several lines', () => {
        const parsed = provider.callParseDeviceCode([
            'Opening your browser to authenticate...',
            'First copy your one-time code: 1A2B-3C4D',
            'Then open https://github.com/login/device in your browser.'
        ].join('\n'));
        expect(parsed?.user_code).to.equal('1A2B-3C4D');
        expect(parsed?.verification_uri).to.equal('https://github.com/login/device');
    });

    it('should extract an enterprise verification URL', () => {
        const parsed = provider.callParseDeviceCode(
            'Enter WXYZ-7890 at https://company.ghe.com/login/device\n'
        );
        expect(parsed?.verification_uri).to.equal('https://company.ghe.com/login/device');
        expect(parsed?.user_code).to.equal('WXYZ-7890');
    });

    it('should return undefined while only the URL has been reported', () => {
        expect(provider.callParseDeviceCode('Visit https://github.com/login/device\n')).to.be.undefined;
    });

    it('should return undefined while only the code has been reported', () => {
        expect(provider.callParseDeviceCode('Your code is AAEB-CD8C\n')).to.be.undefined;
    });

    it('should return undefined for unrelated output', () => {
        expect(provider.callParseDeviceCode('Opening your browser to authenticate...\n')).to.be.undefined;
    });

    it('should not mistake a lowercase word pair for a code', () => {
        expect(provider.callParseDeviceCode('see also-here at https://github.com/login/device\n')).to.be.undefined;
    });
});

describe('CopilotCliAuthProvider - extractFailure', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should pick the line reporting the failure', () => {
        const failure = provider.callExtractFailure([
            'Waiting for authorization...',
            'Error: Access denied by policy settings (Request ID: DEA8:572C1)'
        ].join('\n'));
        expect(failure).to.equal('Error: Access denied by policy settings (Request ID: DEA8:572C1)');
    });

    it('should pick the last failure line when several are reported', () => {
        const failure = provider.callExtractFailure([
            'Error: first problem',
            'unauthorized: not authorized to use this Copilot feature'
        ].join('\n'));
        expect(failure).to.equal('unauthorized: not authorized to use this Copilot feature');
    });

    it('should ignore the clipboard failure the CLI reports on a healthy login', () => {
        const failure = provider.callExtractFailure([
            'To authenticate, visit https://github.com/login/device and enter code B54F-40A3',
            'Failed to copy to clipboard. Please visit https://github.com/login/device and enter the code manually.',
            'Error: Access denied by policy settings'
        ].join('\n'));
        expect(failure).to.equal('Error: Access denied by policy settings');
    });

    it('should not report the clipboard failure as the cause when it is the only match', () => {
        const failure = provider.callExtractFailure([
            'Waiting for authorization...',
            'Failed to copy to clipboard. Please visit https://github.com/login/device manually.'
        ].join('\n'));
        expect(failure).to.contain('Waiting for authorization');
        expect(failure).to.not.contain('clipboard');
    });

    it('should fall back to the tail of the output when no line names the problem', () => {
        expect(provider.callExtractFailure('Waiting for authorization...\n')).to.contain('Waiting for authorization');
    });
});

describe('CopilotCliAuthProvider - toHostUrl', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should prefix a bare domain with https', () => {
        expect(provider.callToHostUrl('company.ghe.com')).to.equal('https://company.ghe.com');
    });

    it('should keep a URL that already has a scheme', () => {
        expect(provider.callToHostUrl('https://company.ghe.com')).to.equal('https://company.ghe.com');
    });

    it('should upgrade a plain HTTP URL, since the sign-in carries credentials', () => {
        expect(provider.callToHostUrl('http://company.ghe.com')).to.equal('https://company.ghe.com');
    });

    it('should not mistake a host that merely starts with "http" for a URL with a scheme', () => {
        expect(provider.callToHostUrl('httpbin.example.com')).to.equal('https://httpbin.example.com');
    });
});

describe('CopilotCliAuthProvider - cancelLogin', () => {

    it('should settle a login that is being awaited, so that closing the dialog does not hang it', async () => {
        const provider = new TestableCopilotCliAuthProvider();
        const result = new Deferred<boolean>();
        provider.setLoginResult(result);

        await provider.cancelLogin();

        expect(await result.promise).to.equal(false);
    });
});

describe('CopilotCliAuthProvider - findTokenInText', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should find the token in the commented JSON the CLI writes', () => {
        const config = [
            '// User settings written by the Copilot CLI',
            '{',
            '  "github": { "token": "gho_abcdefghijklmnopqrstuvwxyz0123" },',
            '  "host": "https://github.com"',
            '}'
        ].join('\n');
        expect(provider.callFindTokenInText(config)).to.equal('gho_abcdefghijklmnopqrstuvwxyz0123');
    });

    it('should find a token regardless of the surrounding format', () => {
        expect(provider.callFindTokenInText('token = ghu_abcdefghijklmnopqrstuvwxyz0123\n')).to.equal('ghu_abcdefghijklmnopqrstuvwxyz0123');
    });

    it('should not match values that only look similar', () => {
        expect(provider.callFindTokenInText('{ "user": "ndoschek", "short": "gho_tooshort", "url": "https://github.com" }')).to.be.undefined;
    });

    it('should return undefined for content without a token', () => {
        expect(provider.callFindTokenInText('// nothing to see here\n{}\n')).to.be.undefined;
    });

});

describe('CopilotCliAuthProvider - findStoredToken', () => {

    const provider = new TestableCopilotCliAuthProvider();
    const token = 'gho_abcdefghijklmnopqrstuvwxyz0123';
    let home: string;

    beforeEach(async () => {
        home = await fs.mkdtemp(join(os.tmpdir(), 'theia-copilot-token-'));
    });

    afterEach(async () => {
        await fs.rm(home, { recursive: true, force: true });
    });

    it('should find the token the CLI persisted', async () => {
        await fs.writeFile(join(home, 'config.json'), `{ "github": { "token": "${token}" } }`);
        expect(await provider.callFindStoredToken(home)).to.equal(token);
    });

    it('should not inspect the files this provider wrote itself', async () => {
        await fs.writeFile(join(home, 'settings.json'), `{ "token": "${token}" }`);
        await fs.writeFile(join(home, 'no-browser.sh'), `#!/bin/sh\n# ${token}\n`);
        expect(await provider.callFindStoredToken(home)).to.be.undefined;
    });

    it('should skip a file that is implausibly large instead of reading it', async () => {
        // Written with a leading newline so that the token would be found if the file were read.
        await fs.writeFile(join(home, 'huge.json'), 'x'.repeat(1024 * 1024 + 1) + `\n${token}\n`);
        expect(await provider.callFindStoredToken(home)).to.be.undefined;
    });

    it('should return undefined for a home without a token', async () => {
        await fs.writeFile(join(home, 'config.json'), '{ "host": "https://github.com" }');
        expect(await provider.callFindStoredToken(home)).to.be.undefined;
    });
});

describe('CopilotCliAuthProvider - parseAccountLabel', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should extract the login the CLI reported', () => {
        expect(provider.callParseAccountLabel('Signed in successfully as ndoschek.')).to.equal('ndoschek');
    });

    it('should extract the login without a trailing period', () => {
        expect(provider.callParseAccountLabel('Signed in successfully as some-user\n')).to.equal('some-user');
    });

    it('should return undefined when no login was reported', () => {
        expect(provider.callParseAccountLabel('Waiting for authorization...')).to.be.undefined;
    });
});

describe('CopilotCliAuthProvider - createLoginEnv', () => {

    const provider = new TestableCopilotCliAuthProvider();

    it('should isolate the login in the given home with the keychain disabled', () => {
        const env = provider.callCreateLoginEnv('/tmp/theia-copilot-login-test', '/tmp/theia-copilot-login-test/no-browser.sh');
        expect(env.COPILOT_HOME).to.equal('/tmp/theia-copilot-login-test');
        expect(env.COPILOT_DISABLE_KEYTAR).to.equal('1');
    });

    it('should remove a token variable whatever its case, since Windows ignores it', () => {
        const previous = { ...process.env };
        try {
            process.env.Github_Token = 'gho_environment';
            const env = provider.callCreateLoginEnv('/tmp/home', '/tmp/home/no-browser.sh');
            expect(Object.keys(env).some(name => name.toLowerCase() === 'github_token')).to.be.false;
        } finally {
            process.env = previous;
        }
    });

    it('should remove tokens from the environment so they cannot satisfy the sign-in', () => {
        const env = provider.callCreateLoginEnv('/tmp/theia-copilot-login-test', '/tmp/theia-copilot-login-test/no-browser.sh');
        expect(env.COPILOT_GITHUB_TOKEN).to.be.undefined;
        expect(env.GH_TOKEN).to.be.undefined;
        expect(env.GITHUB_TOKEN).to.be.undefined;
    });

    it('should point the CLI at the no-op opener and drop the display variables', () => {
        const env = provider.callCreateLoginEnv('/tmp/theia-copilot-login-test', '/tmp/theia-copilot-login-test/no-browser.sh');
        expect(env.BROWSER).to.equal('/tmp/theia-copilot-login-test/no-browser.sh');
        expect(env.DISPLAY).to.be.undefined;
        expect(env.WAYLAND_DISPLAY).to.be.undefined;
    });
});
