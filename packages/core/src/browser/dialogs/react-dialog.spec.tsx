import { expect } from 'chai';
import * as React from 'react';
import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import { ReactDialog } from './react-dialog'

class MyDialog extends ReactDialog<void> {
    constructor() {
        super({ title: '' })
    }

    override get value(): void {
        return;
    }

    protected override render(): React.ReactNode {
        return <></>
    }
}

describe('ReactDialog', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('should be extended', () => {
        const dialog = new MyDialog()
        expect(dialog).to.be.instanceOf(ReactDialog)
    })
})
