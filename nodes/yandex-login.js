var rp = require('request-promise');
var mDnsSd = require('node-dns-sd');
var WebSocket = require("ws");

module.exports = function(RED) {

    function YandexLoginNode(config) {
        RED.nodes.createNode(this,config);
        let node = this
        node.token = this.credentials.token;
        node.getStatus = getStatus;
        node.sendMessage = sendMessage;
        node.debugFlag = config.debugFlag;
        node.ipConnect = config.ipConnect;
        node.deviceList = [];
        node.readyList = [];
        node.activeStationList = [];
        
        
       
        node.on('stopListening', onStopListening);
        node.on('startPlay', onStartPlay)
        node.on('deviceReady', onDeviceReady);
        node.setMaxListeners(50)
        
        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
    


        async function getDevices(token)
        {
            let options = 
                { 
                    method: 'GET',
                    url: 'https://quasar.yandex.net/glagol/device_list',
                    headers: 
                    { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Oauth ' + token 
                    } 
                };
        
      
            await rp(options)
            .then(function(response)
            {
                let data = JSON.parse(response);
                if (node.deviceList.length == 0) {node.deviceList = data.devices;}
                debugMessage(`Recieved device list of ${node.deviceList.length} devices`);
                discoverDevices(node.deviceList)
                .then(() => {
                   
                    node.deviceList.forEach(device => {
                        if (device.address && device.host  && device.port ) {
                           
                             if (node.readyList.find(item => item.id == device.id)){
                                debugMessage('skipping');
                            } else {
                                node.emit(`deviceReady`, device);
                                node.readyList.push({ 'name': device.name,  'id': device.id, 'platform': device.platform, 'address': device.address, 'port': device.port, 'host': device.host});
                                node.emit('refreshHttp', node.readyList)
                                statusUpdate({"color": "yellow", "text": "connecting..."}, device);
                            }
                        }
                    });
                   
                });
                debugMessage(node.id);
                return node.deviceList;
            })
            .catch(function (err) {
                //node.emit('refreshHttp', node.readyList);
                debugMessage(err);
                //console.log(JSON.stringify(err))
                if (err.statusCode == 403) {
                    node.error('Bad oAuth token');
                }
                //debugMessage(JSON.stringify(options));
                return;
            });
        }
        async function discoverDevices(deviceList) {
            await mDnsSd.discover({
                name: '_yandexio._tcp.local'
            }).then((result) => {
                debugMessage(`Found ${result.length} devices`);
                if (result.length != 0){
                    for (const device of deviceList) {
                        result.forEach(element => {
                            let srvEls = element.packet.answers.find(el => el.type == "SRV");
                            let txtEls = element.packet.answers.find(el => el.type == "TXT");
                            if (typeof(txtEls) != undefined ) {
                                if (txtEls.rdata.deviceId == device.id && !device.localConnectionFlag) {
                                    device.address =  element.address;
                                    device.port = element.service.port;
                                    device.host = srvEls.rdata.target;
                                }
                            }    
                        })
                    }
                }
                
            }).catch(function (err) {
                debugMessage(err);
            });
        }

        function removeDevice(readyList, device) {
            let deviceToRemove = readyList.find(item => item.id == device.id)
            if (deviceToRemove) {
                debugMessage(`Removing device from list: ${deviceToRemove.id}`);
                readyList.splice(readyList.indexOf(deviceToRemove),1);
            }
        }


        async function getLocalToken(device) {
            let data;
            let options = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/token',
                qs: { device_id: device.id, platform: device.platform },
                headers: 
                    { 
                        'Authorization': 'Oauth ' + node.token,
                        'Content-Type': 'application/json' 
                    } 
                };
            //   debugMessage(JSON.stringify(options))
            statusUpdate({"color": "yellow", "text": "connecting..."}, device);
            await rp(options)
            .then(function(response)
            {
                data = JSON.parse(response);
                device.token = data.token
                device.localConnectionFlag = true;
    
            })
            .catch(function (err) {
                removeDevice(node.readyList, device);
                debugMessage(err)
            });
        };

        function statusUpdate(status, device){
            debugMessage(`Status update event: ${JSON.stringify(status)} for ${device.id}`);
            node.emit(`statusUpdate_${device.id}`, status)
        }
        function statusUpdateWS(ws, options) {
            switch(ws){
                case 0: 
                    node.status({fill:"yellow",shape:"dot",text:`connecting ${options}`});
                    break;
                case 1: 
                    node.status({fill:"green",shape:"dot",text:`connected`});
                    break;    
                case 2: 
                    node.status({fill:"red",shape:"dot",text:`disconnecting`});
                    break;    
                case 3: 
                    node.status({fill:"red",shape:"dot",text:`disconnected, code ${options}`});
                    break;    
            }
        }
        function onDeviceReady(device) {
            debugMessage(`recieved event devicesListReady for ${device.id}!`)
            connect(device)
        };

        
        function connect(device) {
            debugMessage('recieve conversation token...');
            getLocalToken(device)
            .then(() => {
                makeConn(device)
            })
            .catch(function (err) {
                debugMessage('Error while getting token: ' + err);

              });
        }
        
        async function makeConn(device) {

            let options = {
                key: device.glagol.security.server_private_key,
                cert: device.glagol.security.server_certificate,
                rejectUnauthorized: false
            };
            device.lastState = {};
            //debugMessage(JSON.stringify(options));
            if (node.ipConnect){
                debugMessage(`Connecting to wss://${device.address}:${device.port}`);
                device.ws = new WebSocket(`wss://${device.address}:${device.port}`, options);
            } else {
                debugMessage(`Connecting to wss://${device.host}:${device.port}`);
                device.ws = new WebSocket(`wss://${device.host}:${device.port}`, options); 
            }

            device.ws.on('open', function open(data) { 
                debugMessage(`Connected to ${device.host}, data: ${data}`);
                sendMessage(device.id, 'command', {payload: 'ping'});
                statusUpdate({"color": "green", "text": "connected"}, device);
                //device.localConnectionFlag = true;
                debugMessage(`connection of ${device.id} success!`);
                //device.localConnectionFlag = true;
                device.failConnectionAttempts = 0;
                device.waitForListening = false;
                device.playAfterTTS = false;
                device.watchDog = setTimeout(() => device.ws.close(), 10000);
            });
            device.ws.on('message', function incoming(data) {
                device.lastState = JSON.parse(data).state; 
                node.emit(`message_${device.id}`, device.lastState);
                if (device.lastState.aliceState == 'LISTENING' && device.waitForListening) {node.emit(`stopListening`, device)}
                if (device.lastState.aliceState == 'LISTENING' && device.playAfterTTS) {node.emit('startPlay', device)}
                clearTimeout(device.watchDog);
                device.watchDog = setTimeout(() => {
                device.ws.close()}, 10000);
            }); 

            device.ws.on('close', function close(code, reason){
                statusUpdate({"color": "red", "text": "disconnected"}, device);
                device.lastState = {};
            //if (device.failConnectionAttempts == 3) {
            //    device.localConnectionFlag = false;
            //    removeDevice(node.readyList, device);
            //    node.emit('refreshHttp', node.readyList);
            //}
            if (device.localConnectionFlag) {
                    switch(code) {
                        case 4000:  //invalid token
                            device.failConnectionAttempts =+ 1;
                            debugMessage(`getting new token...`);
                            connect(device);
                            break;
                        case 1000:  
                            device.failConnectionAttempts =+ 1;
                            connect(device);
                            break;   
                        case 1006:
                            device.failConnectionAttempts =+ 1;    
                            debugMessage(`Lost server, reconnect in 60 seconds...${code} + ${reason}` );
                            setTimeout(connect, 60000, device);
                            break;
                        default:
                            device.failConnectionAttempts =+ 1;
                            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting in 60 seconds.` );
                            setTimeout(connect, 60000, device);
                            break;
                    }
                }
                //device.localConnectionFlag = false;
                clearTimeout(device.watchDog);
            })            
            // device.ws.on('ping', function ping(data){
            //     device.ws.pong(data);

            // })
            device.ws.on('error', function error(data){
                //statusUpdate({"color": "red", "text": "disconnected"}, device);
                debugMessage(`error: ${data}`);
                if (device.localConnectionFlag) {
                    //debugMessage(`Reconnecting in 10 seconds...` );
                    //setTimeout(connect, 10000, device);
                }
            });

            

        }

        function messageConstructor(messageType, message, device){
            let commands = ['play', 'stop', 'next', 'prev', 'ping'];
            let extraCommands = ['forward', 'backward'];
            switch(messageType){
                case 'command':
                    if (commands.includes(message.payload)){
                        return [{ "command": message.payload}];
                    } else if (extraCommands.includes(message.payload) && device.lastState.playerState ){
                        let currentPosition = device.lastState.playerState.progress;
                        let duration = device.lastState.playerState.duration;
                        if (message.payload == 'forward'){
                                let targetPosition = currentPosition + 10
                                if (targetPosition < duration) {
                                    return [{
                                        "command": "rewind",
                                        "position": targetPosition
                                    }]
                                } else {
                                    return messageConstructor('command', {'payload': 'next'})
                                }
                            }else if (message.payload == 'backward') {
                                let targetPosition = currentPosition - 10;
                                if (targetPosition > 0) {
                                    return [{
                                        "command": "rewind",
                                        "position": targetPosition
                                    }]
                                } else {
                                    return [{
                                        "command": "rewind",
                                        "position": 0
                                    }] 
                                }
                            }

                    } else {
                        debugMessage(`Bad command!`)
                        //node.error(`You can send commands in msg.payload from list as String ${commands + extraCommands}`);
                        return [{"command": "ping"}];
                    }
                case 'voice': 
                    debugMessage(`Message Voice command: ${message}`);
                    return [{
                        "command" : "sendText",
                        "text" : message.payload
                    }]
                case 'tts':
                    debugMessage(`Message TTS: ${message}`);
                    let result =[];
                    if (message.stopListening) {device.waitForListening = true}
                    if (message.pauseMusic && device.lastState.playing) {
                        messageConstructor('command', {payload: 'stop'}).forEach(item => result.push(item))
                       device.playAfterTTS = true
                        }
                    if (!message.volume){
                        result.push({
                            "command" : "sendText",
                            "text" : `Повтори за мной '${message.payload}'`
                        })

                    } else {
                        result.push({
                            "command" : "setVolume",
                            "volume" : parseFloat(message.volume)
                        },
                            {
                            "command" : "sendText",
                            "text" : `Повтори за мной '${message.payload}'`
                        })
                    }
                    return result;
                    break;
                case 'homekit':
                    debugMessage('HAP: ' + JSON.stringify(message.hap.context) + ' PL: ' + JSON.stringify(message.payload) ); 
                    if (message.hap.context != undefined) {
                        switch(JSON.stringify(message.payload)){
                            case '{"TargetMediaState":1}': 
                                return messageConstructor('command', {payload: 'stop'})
                                break;
                            case '{"TargetMediaState":0}':
                                if (device.lastState.playerState.title != "" && !device.playAfterTTS){
                                    return messageConstructor('command', {'payload': 'play'})
                                } else if (message.noTrackPhrase && !device.playAfterTTS) {
                                    return messageConstructor('voice', {'payload': message.noTrackPhrase})
                                } else {
                                    return messageConstructor('command', {'payload': 'ping'})
                                }

                                break;
                            default:
                                debugMessage('unknown command')
                                return messageConstructor('command', {'payload': 'ping'})
                        }
                        
                    } else {
                        return messageConstructor('command', {'payload': 'ping'})
                    }
                case 'raw': 
                    return [message.payload];
                case 'stopListening': 
                    return [{
                        "command": "serverAction",
                        "serverActionEventPayload": {
                            "type": "server_action",
                            "name": "on_suggest"
                        }
                    }]
            }

        }
        function sendMessage(deviceId, messageType, message) {
            let device = searchDeviceByID(deviceId);
            //debugMessage(`deviceId: ${searchDeviceByID(deviceId)}`);
            debugMessage(`WS.STATE: ${device.ws.readyState} recive ${messageType} with ${JSON.stringify(message)}`);
            if (device.ws.readyState == 1){

                    for (let m of messageConstructor(messageType, message, device)) {
                        let data = {
                            "conversationToken": device.token,
                            "id": device.id,
                            "payload": m,
                            "sentTime": Date.now()
                            }
                            device.ws.send(JSON.stringify(data));
                        debugMessage('Send message: ' + JSON.stringify(data));
                    }
                return 'ok'
            } else {
                return 'Device offline'
            }
        }
        
        function searchDeviceByID(id) {
            return node.deviceList.find(device => device.id == id)
        }
        
        function getStatus(id) {
            let device = searchDeviceByID(id);
            if (typeof(device) === 'object') {
                switch(device.ws.readyState){
                    case 0: 
                    return {"color": "yellow", "text": "connecting..."}
                    break;
                    case 1: 
                    return {"color": "green", "text": "connected"}
                    break;    
                    case 2: 
                    return {"color": "red", "text": "disconnecting"}
                    break;    
                    case 3: 
                    return {"color": "red", "text": "disconnected"}
                    break;    
                }
                 
            } else {
                return {"color": "red", "text": "disconnected"}
            }
        }


        function onStopListening(device) {
            sendMessage(device.id, 'stopListening');
            device.waitForListening = false;
        }

        function onStartPlay(device) {
            sendMessage(device.id, 'command', {payload: 'play'});
            device.playAfterTTS = false;
        }
        
        function onClose() {
            clearInterval(node.interval);
            node.deviceList = [];
            node.removeListener('deviceReady', onDeviceReady)
        }
        
        node.on('refreshHttp', function(data) {
            RED.httpAdmin.get("/yandexdevices_"+node.id, RED.auth.needsPermission('yandex-login.read'), function(req,res) {
                res.json({"devices": data});
            });
        });
        node.on('close', onClose)
        
        // main init
        getDevices(node.token);
        node.interval = setInterval(getDevices, 60000, node.token);

    }

    RED.nodes.registerType('yandex-login', YandexLoginNode, {
        credentials: {
            token: {type:"text"}
        }
    });

}