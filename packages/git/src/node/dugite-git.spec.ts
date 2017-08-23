import * as temp from 'temp';
import { expect } from 'chai';

const track = temp.track();

describe('git', async () => {

    after(async () => {
        track.cleanupSync();
    });

    it('TODO', async () => {
        expect(true);
    });

});
