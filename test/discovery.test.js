'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setImmediate(resolve));

// Run the real node registration and polling code without Node-RED, cloud
// requests, UDP sockets, or real timers. Each fixture has a fresh module scope.
function fixture() {
    let constructor;
    let discover = () => Promise.resolve([]);
    const calls = [];
    const polls = [];
    const logs = [];
    const module = { exports: {} };
    const source = process.env.YANDEX_SOURCE || path.resolve(__dirname, '../nodes/yandex-login.js');
    const mocks = {
        'request-promise': () => Promise.resolve(JSON.stringify({ devices: [] })),
        'node-dns-sd': { discover: options => { calls.push(options); return discover(); } },
        'node-dns-sd/lib/dns-sd-parser': {},
        ws: class WebSocket {}
    };
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
        module,
        require: name => {
            assert.ok(Object.hasOwn(mocks, name), 'unexpected dependency: ' + name);
            return mocks[name];
        },
        setInterval: (fn, delay, ...args) => {
            const poll = () => fn(...args);
            polls.push(poll);
            return poll;
        },
        clearInterval: () => {},
        setTimeout: () => { throw new Error('Unexpected device connection'); },
        clearTimeout: () => {},
        console
    }, { filename: source });
    module.exports({
        nodes: {
            registerType: (name, node) => { constructor = node; },
            createNode: (node, config) => {
                const events = new EventEmitter();
                for (const method of ['on', 'emit', 'removeListener', 'setMaxListeners']) {
                    node[method] = events[method].bind(events);
                }
                node.id = config.id;
                node.credentials = { token: 'test-only-token' };
                node.log = message => logs.push(message);
                node.error = message => logs.push(message);
            }
        },
        httpAdmin: { get: () => {} },
        auth: { needsPermission: () => () => {} }
    });
    return {
        calls, polls, logs,
        create: id => new constructor({ id, debugFlag: true }),
        discover: fn => { discover = fn; }
    };
}

test('two login nodes share one discovery and both receive its result', async () => {
    const f = fixture();
    const pending = deferred();
    f.discover(() => pending.promise);
    const received = [];
    f.create('first').on('refreshHttpDNS', result => received.push(result));
    f.create('second').on('refreshHttpDNS', result => received.push(result));
    await tick();
    const count = f.calls.length;
    const result = [];
    pending.resolve(result);
    await tick();
    assert.equal(count, 1);
    assert.equal(f.calls[0].name, '_yandexio._tcp.local');
    assert.equal(received.length, 2);
    assert.ok(received.every(value => value === result));
});

test('repeated polling during a slow search shares the pending operation', async () => {
    const f = fixture();
    const pending = deferred();
    f.discover(() => pending.promise);
    f.create('first');
    await tick();
    f.polls[0]();
    f.polls[0]();
    await tick();
    const count = f.calls.length;
    pending.resolve([]);
    await tick();
    assert.equal(count, 1);
});

test('a later poll starts a fresh discovery after success', async () => {
    const f = fixture();
    f.create('first');
    await tick();
    assert.equal(f.calls.length, 1);
    f.polls[0]();
    await tick();
    assert.equal(f.calls.length, 2);
});

test('shared discovery rejection reaches both callers and allows retry', async () => {
    const f = fixture();
    const pending = deferred();
    f.discover(() => pending.promise);
    f.create('first');
    f.create('second');
    await tick();
    const count = f.calls.length;
    const error = new Error('socket bind failed');
    pending.reject(error);
    await tick();
    assert.equal(count, 1);
    assert.equal(f.logs.filter(value => value === error).length, 2);
    f.discover(() => Promise.resolve([]));
    f.polls[0]();
    await tick();
    assert.equal(f.calls.length, 2);
});

test('synchronous discovery errors are handled and do not prevent retry', async () => {
    const f = fixture();
    const error = new Error('socket setup failed');
    f.discover(() => { throw error; });
    f.create('first');
    await tick();
    assert.ok(f.logs.includes(error));
    f.discover(() => Promise.resolve([]));
    f.polls[0]();
    await tick();
    assert.equal(f.calls.length, 2);
});

test('a login node created during discovery joins the existing search', async () => {
    const f = fixture();
    const pending = deferred();
    f.discover(() => pending.promise);
    f.create('first');
    await tick();
    const received = [];
    f.create('second').on('refreshHttpDNS', value => received.push(value));
    await tick();
    const count = f.calls.length;
    pending.resolve([]);
    await tick();
    assert.equal(count, 1);
    assert.equal(received.length, 1);
});
