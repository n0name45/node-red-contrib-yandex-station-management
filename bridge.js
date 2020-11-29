var rp = require('request-promise');
var mDnsSd = require('node-dns-sd');
var WebSocket = require("ws");
const { initParams } = require('request-promise-native');

module.exports = function(RED) {
    function AliceLocalBridgeNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        this.config = RED.nodes.getNode(config.otoken);
        let token = this.config.token;
        let deviceId = config.device_id;
        let outputFormat = config.output;
        let deviceList= [];
        let discoveredDevices = [];
        let lastState = {};
        let msg = {};
        let debugFlag = true;
    
       node.config.on(`deviceReady${deviceId}`, function(data) {
           let device = data;
           node.log(`recieved event devicesListReady! ${JSON.stringify(device)}`)
            getLocalToken(device)
            .then(() => {
                makeConn(device)
            })
        })
       //node.config.sender(node.id);
        function debugMessage(text){
            if (debugFlag) {
                let msgDebug = {};
                node.log(text);
                //msgDebug.debug = text;
                //node.send(msgDebug);
            }
        }

        async function getDeviceProperties(id) {
            let device;
            let temp;
            await getDeviceList()
            .then(list => {
                node.status({fill:"yellow",shape:"dot",text:`Getting device properties`});
                device = list.find(el => el.id == id);

                if (typeof(device) != 'object') {
                    node.status({fill:"red",shape:"dot",text:`No devices registered`});
                } else {
                    //debugMessage(`device id: ${device.id}`);
                    getLocalToken(device)
                    .then(() => {
                        discoverDevice(device)
                        .then(() => {
                            makeConn(device);
                        //debugMessage(device);
                        })
                    });

                }
            })
            .catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
                node.status({fill:"red",shape:"dot",text:`Auntethication error`})
            });
        }
        
        async function getDeviceList(){
            let connectOptions = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/device_list',
                headers: 
                {
                    'Content-Type': 'application/json',
                    'Authorization': 'Oauth ' + token 
                } 
            };
            await rp(connectOptions)
            .then(function(response) {
                deviceList = JSON.parse(response).devices;
                debugMessage(JSON.parse(response).devices)
            })
            .catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });
            return deviceList;
        }

        async function getDevices()
        {
            let data;
            let temp;
            let stageCompleted = 0;
            let options = 
                { 
                    method: 'GET',
                    url: 'https://quasar.yandex.net/glagol/device_list',
                    headers: 
                    { 
                        Connection: 'keep-alive',
                        Host: 'quasar.yandex.net',
                        'Content-Type': 'application/json',
                        Authorization: 'Oauth ' + token 
                    } 
                };
        
      
            await rp(options)
            .then(function(response)
            {
                data = JSON.parse(response);
                deviceList = data.devices;
                
                debugMessage(`Recieved device list of ${deviceList.length} devices`);
                stageCompleted = 1;
                node.status({fill:"yellow",shape:"dot",text:`Recieving devices...`});
                if (deviceList.length == 0) {
                    debugMessage(`Repeat cause ${deviceList.length}`);
                    setTimeout(getDevices, 5000);
                } 
            })
            .catch(function (err) {
                if (deviceList.length == 0) {
                    debugMessage(`Repeat cause ${deviceList.length}`);
                    setTimeout(getDevices, 5000);
                } 
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });
            //setTimeout(debugMessage, 50000, "Reapet getting list of devices...");
        
        if (stageCompleted == 1) {
            await discoverDevices()
            .then(result => {
                discoveredDevices = result;
                if (discoveredDevices.length == 0) {
                    debugMessage(`Repeat discovering cause ${discoveredDevices.length}`);
                    setTimeout(discoverDevices, 5000);
                } else {
                    stageCompleted = 2;
                }
            })
            .catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
                setTimeout(discoverDevices, 5000);
            }); 
        };
        if (stageCompleted == 2) {
            for (const device of deviceList) {
                await getLocalToken(device.id)
                .then(result => {
                    device.token = result
                    debugMessage(`Recieved local auth token for ${device.id}`);
                    discoveredDevices.forEach(element => {
                        let srvEls = element.packet.answers.find(el => el.type == "SRV");
                        let txtEls = element.packet.answers.find(el => el.type == "TXT");
                        if (txtEls.rdata.deviceId == device.id) {
                            device.address =  element.address;
                            device.port = element.service.port;
                            device.host = srvEls.rdata.target;
                        }    
                    });
                })
                .catch(function (err) {
                    let errMsg = {};
                    node.log(err);
                    errMsg.payload = err;
                    node.send(errMsg);
                }); 
            }
        } 
        return deviceList;    
        }
        
        async function getLocalToken(device) {
            let data;
            let options = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/token',
                qs: { device_id: device.id },
                headers: 
                    { 
                        'Authorization': 'Oauth ' + token,
                        'Content-Type': 'application/json' 
                    } 
                };
            await rp(options)
            .then(function(response)
            {
                data = JSON.parse(response);
                device.token = data.token
    
            })
            .catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });
         //   return data.token    
        };

        async function discoverDevices() {
            let discoverResult;
            node.status({fill:"yellow",shape:"dot",text:`Discovering devices...`});
            await mDnsSd.discover({
                name: '_yandexio._tcp.local'
            }).then((result) => {
                discoverResult = result;
                debugMessage(`Found ${discoverResult.length} devices`);
                
            }).catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });
            return discoverResult;
        }
        async function discoverDevice(device){
            let stop = false;
            do {
                await discoverDevices()
                .then(discresult => {
                    discresult.forEach(element => {
                        let srvEls = element.packet.answers.find(el => el.type == "SRV");
                        let txtEls = element.packet.answers.find(el => el.type == "TXT");
                        if (txtEls.rdata.deviceId == device.id) {
                            device.address =  element.address;
                            device.port = element.service.port;
                            device.host = srvEls.rdata.target;
                        }    
                    })
                    if (device.host == undefined || device.port == undefined) {
                        debugMessage('Devices not found');
                        node.status({fill:"red",shape:"dot",text:`Device not found`});
                        //setTimeout(discoverDevices, 5000);

                    } else {
                        node.status({fill:"yellow",shape:"dot",text:`Found device on ${device.address}`});
                        stop = true;
                    }
                })
                .catch(function (err) {
                    let errMsg = {};
                    node.log(err);
                    errMsg.payload = err;
                    node.send(errMsg);
                    stop = true;
                    setTimeout(getDeviceProperties, 5000, deviceId);
                });
            } while (!stop);
        }
        async function makeConn(device) {
            let options = {
                key: device.glagol.security.server_private_key,
                cert: device.glagol.security.server_certificate,
                rejectUnauthorized: false
            };
            let msg = {};
            let payload = {
                "conversationToken": device.token,
                "id": device.id,
                 "payload": {
                    "command": "ping"
                },
                "sentTime": 1
                };  

            debugMessage(`Connecting to wss://${device.host}:${device.port}`);

            let ws = new WebSocket(`wss://${device.host}:${device.port}`, options);
    
            node.status({fill:"yellow",shape:"dot",text:`State ${ws.readyState}`});
            ws.on('open', async function open() {
                debugMessage(`Connected to ${device.host}`);
                node.status({fill:"green",shape:"dot",text:`State ${ws.readyState}`});
                ws.send(JSON.stringify(payload));
                ws.on('message', function incoming(data) {
                    lastState = JSON.parse(data).state; 
                    msg.payload = lastState;
                    node.send(msg);
                });
        
            });
            ws.on('close', function close(data){
                node.status({fill:"red",shape:"dot",text:"disconnected"});
            })            
            ws.on('pong', function pong(data){
                node.status({fill:"green",shape:"dot",text:"pong"});
                msg.payload = 'pong';
                node.send(msg);
            })
            node.on('input', function(msgInput) {
                if (msgInput.payload == 'ping') {
                    ws.ping();
                } 
                if (msgInput.payload == 'stop'){
                    ws.close();
                }
                if (msgInput.payload == 'state'){
                    msg.payload = lastState;
                    debugMessage(JSON.stringify(lastState));
                    //node.send(msg);
                }
                if (msgInput.payload == 'command'){
                    if (msgInput != undefined) {
                        payload = {
                            "conversationToken": device.token,
                            "id": device.id,
                            "payload": msgInput.command,
                            "sentTime": 1
                            };  
            
                        ws.send(JSON.stringify(payload));
                        debugMessage(`Sended command ${JSON.stringify(payload)}`)
                    };
                };

                node.status({fill:"red",shape:"dot",text:`State: ${msgInput.payload}`});
            });
        }
        //getDeviceProperties(deviceId);
        node.on('input', function(msgInput) {
            node.status({fill:"yellow",shape:"dot",text:`State: ${msgInput.payload}`});
            let device;
            if (msgInput.payload == 'devices'){
                getDevices().then(result => {
                    let msg = {};
                    msg.payload = result;
                    node.send(msg);
                });
            };
            if (msgInput.payload == 'device') {
                getDeviceProperties(deviceId).then(result => {
                    device = result;
                    let msg = {};
                    msg.stage = "ready";
                    msg.payload = device;
                    node.send(msg);
                })
            }
            if (msgInput.payload == 'connect') {
                node.status({fill:"yellow",shape:"dot",text:`State: ${msgInput.payload}`});
                makeConn(device);
            }
         });

        
    }
    RED.nodes.registerType("alice-local-bridge",AliceLocalBridgeNode);
}