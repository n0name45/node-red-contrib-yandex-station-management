'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const flush = () => new Promise(resolve => setImmediate(resolve));

function limited() {
    return Object.assign(new Error('429 - "limited"'), { name: 'StatusCodeError', statusCode: 429 });
}

// The real login node with a fake cloud, mDNS, station websocket and a virtual clock.
// One station, found by mDNS like a real one; a station node listens to it, so the
// login node connects. The station answers every command unless it is silent.
function fixture() {
    let constructor;
    let now = 0;
    const timers = new Set();
    const requests = [];
    const sockets = [];
    const station = { silent: false };
    const cloud = {
        list: () => Promise.resolve(JSON.stringify({ devices: [{
            id: 'ST1', name: 'Station', platform: 'yandexmini',
            glagol: { security: { server_private_key: 'key', server_certificate: 'cert' } }
        }] })),
        token: () => Promise.resolve(JSON.stringify({ token: 'conversation-token' }))
    };
    let discoveries = 0;
    const answer = [{
        address: '192.0.2.10',
        service: { port: 1961 },
        packet: {
            answers: [{ type: 'TXT', rdata: { deviceId: 'ST1' } }, { type: 'SRV', rdata: { target: 'st1.local' } }],
            additionals: []
        }
    }];

    const later = (ms, fn, every) => {
        const timer = { at: now + Math.max(1, Number(ms) || 0), fn, every };
        timers.add(timer);
        return timer;
    };

    class Socket extends EventEmitter {
        constructor() {
            super();
            this.readyState = 0;
            sockets.push(this);
            later(30, () => { if (this.readyState === 0) { this.readyState = 1; this.emit('open'); } });
        }
        send() {
            if (this.readyState !== 1 || station.silent) return;
            later(20, () => {
                if (this.readyState === 1) this.emit('message', JSON.stringify({ state: { aliceState: 'IDLE' } }));
            });
        }
        close(code = 1000) {
            if (this.readyState === 3) return;
            this.readyState = 3;
            later(1, () => this.emit('close', code, ''));
        }
        terminate() { this.close(1006); }
    }

    const mocks = {
        'request-promise': options => {
            const list = options.url.endsWith('/device_list');
            requests.push(list ? 'device_list' : 'token');
            return list ? cloud.list() : cloud.token();
        },
        'node-dns-sd': { discover: () => { discoveries++; return Promise.resolve(answer); } },
        'node-dns-sd/lib/dns-sd-parser': {},
        ws: Socket
    };
    const source = process.env.YANDEX_SOURCE || path.resolve(__dirname, '../nodes/yandex-login.js');
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
        module,
        require: name => {
            assert.ok(Object.hasOwn(mocks, name), 'unexpected dependency: ' + name);
            return mocks[name];
        },
        setTimeout: (fn, ms, ...args) => later(ms, () => fn(...args)),
        setInterval: (fn, ms, ...args) => later(ms, () => fn(...args), ms),
        clearTimeout: timer => timers.delete(timer),
        clearInterval: timer => timers.delete(timer),
        console
    }, { filename: source });
    module.exports({
        nodes: {
            registerType: (name, node) => { constructor = node; },
            createNode: (node, config) => {
                const events = new EventEmitter();
                for (const method of ['on', 'emit', 'removeListener', 'setMaxListeners', 'listenerCount']) {
                    node[method] = events[method].bind(events);
                }
                node.id = config.id;
                node.credentials = { token: 'test-only-token' };
                node.log = () => {};
                node.error = () => {};
            }
        },
        httpAdmin: { get: () => {}, post: () => {} },
        auth: { needsPermission: () => () => {} }
    });

    return {
        requests, sockets, station, cloud,
        count: kind => requests.filter(value => value === kind).length,
        discoveries: () => discoveries,
        login: () => {
            const node = new constructor({ id: 'login', debugFlag: true });
            node.on('statusUpdate_ST1', () => {});
            return node;
        },
        // run every timer that is due within ms, letting promises settle in between
        advance: async ms => {
            const until = now + ms;
            for (;;) {
                await flush();
                let due = null;
                for (const timer of timers) {
                    if (timer.at <= until && (!due || timer.at < due.at)) due = timer;
                }
                if (!due) break;
                now = due.at;
                if (due.every) due.at += due.every; else timers.delete(due);
                due.fn();
            }
            now = until;
            await flush();
        }
    };
}

test('device_list is requested only until the first answer', async () => {
    const f = fixture();
    let calls = 0;
    const list = f.cloud.list;
    f.cloud.list = () => (++calls === 1 ? Promise.reject(limited()) : list());
    f.login();
    await f.advance(10 * 60e3);
    assert.equal(f.count('device_list'), 2);
    // mDNS still runs on every tick, so a station that moves to a new address is found
    assert.ok(f.discoveries() >= 9);
    assert.equal(f.sockets.filter(socket => socket.readyState === 1).length, 1);
});

test('a failed token request does not dial the station or poll the cloud again', async () => {
    const f = fixture();
    let calls = 0;
    const token = f.cloud.token;
    f.cloud.token = () => (++calls === 1 ? Promise.reject(limited()) : token());
    f.login();
    await f.advance(1e3);
    assert.equal(f.count('token'), 1);
    assert.equal(f.sockets.length, 0);
    assert.equal(f.count('device_list'), 1);
    // the next tick announces the station again and it connects with a fresh token
    await f.advance(60e3);
    assert.equal(f.count('token'), 2);
    assert.equal(f.sockets.length, 1);
});

test('only one token request per station at a time', async () => {
    const f = fixture();
    let release;
    f.cloud.token = () => new Promise(resolve => {
        release = () => resolve(JSON.stringify({ token: 'conversation-token' }));
    });
    const login = f.login();
    await f.advance(1e3);
    const device = login.deviceList[0];
    login.emit('deviceReady', device);
    login.emit('deviceReady', device);
    await f.advance(1e3);
    assert.equal(f.count('token'), 1);
    release();
    await f.advance(1e3);
    assert.equal(f.sockets.length, 1);
});

test('reconnects to a silent station back off to 5 minutes', async () => {
    const f = fixture();
    f.station.silent = true;
    f.login();
    // the 10 s watchdog closes every socket the station never answers on
    await f.advance(30 * 60e3);
    assert.ok(f.count('token') <= 13, `${f.count('token')} tokens in 30 minutes`);
    // once the station talks again, the next drop is redialled at once
    f.station.silent = false;
    await f.advance(10 * 60e3);
    const live = f.sockets.at(-1);
    assert.equal(live.readyState, 1);
    live.close(1000);
    await f.advance(1e3);
    assert.equal(f.sockets.at(-1).readyState, 1);
    assert.notEqual(f.sockets.at(-1), live);
});
