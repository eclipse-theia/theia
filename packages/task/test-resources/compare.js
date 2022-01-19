/**
 * Compares if two arrays contain the same primitive values.
 */
exports.compareArrayValues = function (a, b) {
    if (a.length !== b.length) {
        return false
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}
