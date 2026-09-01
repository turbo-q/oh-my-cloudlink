'use strict'

const fs = require('node:fs')
const path = require('node:path')

function unavailable(reason) {
  return {
    isAvailable: () => false,
    loadError: () => reason,
    attach() {
      throw new Error(reason)
    },
    detach() {},
    setBounds() {},
    setVisible() {},
    focus() {},
    createSession() {
      throw new Error(reason)
    },
    destroySession() {},
    setActiveSession() {},
    writeOutput() {},
    scrollToBottom() {},
    resizeSession() {},
    getCellMetrics: () => ({ width: 8, height: 16 }),
    setInputCallback() {},
    clearInputCallback() {},
  }
}

function loadBinding() {
  const candidates = [
    'native-term.node',
    `native-term.${process.platform}-${process.arch}.node`,
    `native-term.darwin-arm64.node`,
    `native-term.darwin-x64.node`,
  ]
  const errors = []
  for (const name of candidates) {
    const full = path.join(__dirname, name)
    if (!fs.existsSync(full)) continue
    try {
      return require(full)
    } catch (err) {
      errors.push(`${name}: ${err.message}`)
    }
  }
  // Also accept any leftover *.node from napi
  try {
    const found = fs.readdirSync(__dirname).filter((f) => f.endsWith('.node'))
    for (const name of found) {
      try {
        return require(path.join(__dirname, name))
      } catch (err) {
        errors.push(`${name}: ${err.message}`)
      }
    }
  } catch {
    // ignore
  }
  const reason =
    errors[0] ||
    'native-term addon missing; run: npm run build:native-term'
  return unavailable(reason)
}

module.exports = loadBinding()
