const {
    compareArrayValues
} = require('./compare')

const debugHint = process.argv[2]
const args = process.argv.slice(3)

if (compareArrayValues(args, ['a', 'b', '   c'])) {
    process.exit(0) // OK
} else {
    console.error(debugHint, JSON.stringify(args))
    process.exit(1) // NOT OK
}
