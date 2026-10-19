'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Загружает реальный nodes/in.js в изолированном контексте: stationHelper настоящий,
// Node-RED (RED.nodes, node.status/send/log) — заглушки.
function fixture(config) {
    let constructor;
    const controller = new EventEmitter();
    controller.getStatus = () => null;
    const module = { exports: {} };
    const source = path.resolve(__dirname, '../nodes/in.js');
    const helperSource = path.resolve(__dirname, '../lib/stationHelper.js');
    const helper = { exports: {} };
    vm.runInNewContext(fs.readFileSync(helperSource, 'utf8'), { module: helper }, { filename: helperSource });
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
        module,
        require: name => {
            if (name === '../lib/stationHelper.js') {
                return helper.exports;
            }
            throw new Error('unexpected dependency: ' + name);
        },
        RED: {
            nodes: {
                registerType: (name, node) => { constructor = node; },
                createNode: (node, cfg) => {
                    Object.assign(node, cfg);
                    node.id = cfg.id;
                    const events = new EventEmitter();
                    node.on = events.on.bind(events);
                    node.removeListener = events.removeListener.bind(events);
                    node.status = () => {};
                    node.log = () => {};
                },
                getNode: () => controller
            }
        }
    }, { filename: source });
    module.exports({
        nodes: {
            registerType: (name, node) => { constructor = node; },
            createNode: (node, cfg) => {
                Object.assign(node, cfg);
                node.id = cfg.id;
                const events = new EventEmitter();
                node.on = events.on.bind(events);
                node.removeListener = events.removeListener.bind(events);
                node.status = () => {};
                node.log = () => {};
                node.send = message => sends.push(message);
            },
            getNode: () => controller
        }
    });
    const sends = [];
    const node = new constructor({ id: 'in1', token: 'tok', station_id: 'st', debugFlag: false, ...config });
    node.send = message => sends.push(message);
    return { node, sends, controller };
}

test('unique messages: дубликат не отправляется в режиме status', () => {
    const { node, sends } = fixture({ output: 'status', uniqueFlag: true });
    node.onMessage({ event: 'playerState', value: 'playing' });
    node.onMessage({ event: 'playerState', value: 'playing' });
    node.onMessage({ event: 'playerState', value: 'paused' });
    assert.equal(sends.length, 2);
});

test('unique messages: дубликат не отправляется в режиме homekit', () => {
    const { node, sends } = fixture({ output: 'homekit', uniqueFlag: true, homekitFormat: 'speaker' });
    node.onMessage({ playing: true, playerState: { subtitle: 'A', title: 'B' } });
    node.onMessage({ playing: true, playerState: { subtitle: 'A', title: 'B' } });
    node.onMessage({ playing: false });
    assert.equal(sends.length, 2);
});

test('unique messages отключён: все сообщения идут', () => {
    const { node, sends } = fixture({ output: 'status', uniqueFlag: false });
    node.onMessage({ event: 'x' });
    node.onMessage({ event: 'x' });
    assert.equal(sends.length, 2);
});
