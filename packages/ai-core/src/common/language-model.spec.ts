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

import { isModelMatching, LanguageModel, LanguageModelSelector, isToolCallHtmlAppResult } from './language-model';
import { expect } from 'chai';

describe('isModelMatching', () => {
    it('returns false with one of two parameter mismatches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'XXX',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(false);
    });
    it('returns false with two parameter mismatches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'XXX',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'ZZZ',
                }
            )
        ).eql(false);
    });
    it('returns true with one parameter match', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'gpt-4o',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                }
            )
        ).eql(true);
    });
    it('returns true with two parameter matches', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{
                    name: 'gpt-4o',
                    family: 'YYY',
                },
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(true);
    });
    it('returns true if there are no parameters in selector', () => {
        expect(
            isModelMatching(
                <LanguageModelSelector>{},
                <LanguageModel>{
                    name: 'gpt-4o',
                    family: 'YYY',
                }
            )
        ).eql(true);
    });
});

describe('isToolCallHtmlAppResult', () => {
    it('returns true for valid html app result', () => {
        expect(isToolCallHtmlAppResult({ type: 'html', html: '<div>Hello</div>' })).to.be.true;
    });

    it('returns true with optional title', () => {
        expect(isToolCallHtmlAppResult({ type: 'html', html: '<p>App</p>', title: 'My App' })).to.be.true;
    });

    it('returns false for text result', () => {
        expect(isToolCallHtmlAppResult({ type: 'text', text: 'hello' })).to.be.false;
    });

    it('returns false for missing html field', () => {
        expect(isToolCallHtmlAppResult({ type: 'html' })).to.be.false;
    });

    it('returns false for null', () => {
        expect(isToolCallHtmlAppResult(undefined)).to.be.false;
    });

    it('returns false for undefined', () => {
        expect(isToolCallHtmlAppResult(undefined)).to.be.false;
    });

    it('returns true for full iframe-ready html app result', () => {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Animated Unit Test Sandbox</title>
<style>
 html, body { margin: 0; height: 100%; overflow: hidden; background: #0f172a; font-family: Inter, Arial, sans-serif; }
 .scene { position: relative; width: 100%; height: 100%; background: radial-gradient(circle at top, #1e293b 0%, #020617 70%); overflow: hidden; }
 .grid { position: absolute; inset: 0; background-size: 40px 40px; animation: drift 12s linear infinite;
  background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); }
 @keyframes drift { from { transform: translateY(0px); } to { transform: translateY(40px); } }
 .panel { position: absolute; top: 50%; left: 50%; width: 340px;
  transform: translate(-50%, -50%); background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 24px;
  box-shadow: 0 0 50px rgba(59,130,246,0.3), inset 0 0 30px rgba(255,255,255,0.03);
  backdrop-filter: blur(10px); }
 .title { color: white; font-size: 24px; font-weight: 700; margin-bottom: 8px; }
 .subtitle { color: #94a3b8; margin-bottom: 24px; }
 .test { display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
  color: white; font-size: 14px; opacity: 0; transform: translateX(-10px);
  animation: reveal 0.5s forwards; }
 .test:nth-child(3) { animation-delay: 0.2s; }
 .test:nth-child(4) { animation-delay: 0.5s; }
 .test:nth-child(5) { animation-delay: 0.8s; }
 .test:nth-child(6) { animation-delay: 1.1s; }
 @keyframes reveal { to { opacity: 1; transform: translateX(0); } }
 .dot { width: 12px; height: 12px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 12px #22c55e; animation: pulse 1.5s infinite; }
 .warn { background: #f59e0b; box-shadow: 0 0 12px #f59e0b; }
 .fail { background: #ef4444; box-shadow: 0 0 12px #ef4444; }
 @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.7; } }
 .particle { position: absolute; border-radius: 50%; background: rgba(96,165,250,0.25); animation: float linear infinite; }
 @keyframes float { from { transform: translateY(100vh) scale(0.5); } to { transform: translateY(-120px) scale(1.2); } }
 .footer { margin-top: 20px; color: #64748b; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="scene">
 <div class="grid"></div>
 <div class="panel">
  <div class="title">Unit Test Runner</div>
  <div class="subtitle">Simulated CI Environment</div>
  <div class="test"><div class="dot"></div>auth.service.spec.ts</div>
  <div class="test"><div class="dot"></div>payments.integration.spec.ts</div>
  <div class="test"><div class="dot warn"></div>websocket.reconnect.spec.ts</div>
  <div class="test"><div class="dot fail"></div>cache.invalidation.spec.ts</div>
  <div class="footer">24 passed • 1 flaky • 1 failed</div>
 </div>
</div>
</body>
</html>`;
        expect(isToolCallHtmlAppResult({ type: 'html', html, title: 'Animated Unit Test Sandbox' })).to.be.true;
    });
});
