
interface DemoInterface {
    stringField: string;
    numberField: number;
    doSomething(): number;
}

class DemoClass implements DemoInterface {
    stringField: string;
    numberField: number;
    constructor(someString: string) {
        this.stringField = someString;
        this.numberField = this.stringField.length;
    }
    doSomething(): number {
        let output = 0;
        for (let i = 0; i < this.stringField.length; i++) {
            output += this.stringField.charCodeAt(i);
        }
        return output;
    }
}

const demoInstance = new DemoClass('demo');

const demoVariable = demoInstance.stringField;

demoVariable.concat('-string');

import { DefinedInterface } from "./demo-definitions-file";

const bar: DefinedInterface = { coolField: [] };
