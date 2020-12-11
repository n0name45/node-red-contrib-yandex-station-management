var rp = require('request-promise');

var WebSocket = require("ws");

module.exports = function(RED) {
    function AliceLocalBridgeNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.sendMessage = sendMessage;
        node.waitForListening = false;
        node.lastState = {};
        node.controller = RED.nodes.getNode(config.otoken);
        node.token =  node.controller.credentials.otoken;
        node.deviceId = config.device_id;
        node.debugFlag = config.debug;
        node.station =  node.controller.getDevice(node.deviceId);
        node.connection = true;
        node.status({});

        
        node.controller.on(`deviceReady${node.deviceId}`, onDeviceReady)
        
        node.on('stopListening', onStopListening);
        node.on('close', onNodeClose)

        if (node.station != '1' && node.station != '2') {
            debugMessage('connect to ' + node.station.address);
            node.device = node.station;
            connect(node.device);
        }


        function onDeviceReady(data) {
            node.device = data;
            //station = data;
            debugMessage(`recieved event devicesListReady!`)
            connect(node.device)
        };

        function onStopListening() {
            sendMessage('stopListening');
            node.waitForListening = false;
        }

        function onNodeClose() {
            node.connection = false;
            debugMessage('closing');
            if (typeof(node.ws) != undefined ) {node.ws.terminate()}
            node.status({fill:"red",shape:"dot",text:`disconnected`});
            clearTimeout(node.watchDog);
            node.controller.unregister(node.id, node.deviceId);
            node.controller.removeListener(`deviceReady${node.deviceId}`, onDeviceReady)
        }
        function debugMessage(text){
            if (node.debugFlag) {
               // let msgDebug = {};
                node.log(text);
                //msgDebug.debug = text;
                //node.send(msgDebug);
            }
        }

        function messageConstructor(messageType, message){
            switch(messageType){
                case 'command':
                    if (['play', 'stop', 'next', 'prev', 'ping'].includes(message.payload)){
                        return [{ "command": message.payload}];
                    } else {
                        debugMessage('unknown command. Send commands: play, stop, next, prev in payload of message ')
                        return [{"command": "ping"}];
                    }
                    break;
                case 'voice': 
                    debugMessage(`Message Voice command: ${message}`);
                    return [{
                        "command" : "sendText",
                        "text" : message.payload
                    }]
                case 'tts':
                    debugMessage(`Message TTS: ${message}`);
                    if (message.stopListening == true) {node.waitForListening = true}
                    if (message.volume == undefined){
                        return [{
                            "command" : "sendText",
                            "text" : `Повтори за мной '${message.payload}'`
                        }]

                    } else {
                        return [{
                            "command" : "setVolume",
                            "volume" : parseFloat(message.volume)
                        },
                            {
                            "command" : "sendText",
                            "text" : `Повтори за мной '${message.payload}'`
                        }]
                    }
                    
                    break;
                case 'homekit':
                    debugMessage('HAP: ' + JSON.stringify(message.hap.context) + ' PL: ' + JSON.stringify(message.payload) ); 
                    if (message.hap.context != undefined) {
                        switch(JSON.stringify(message.payload)){
                            case '{"TargetMediaState":1}': 
                                return messageConstructor('command', {payload: 'stop'})
                                break;
                            case '{"TargetMediaState":0}':
                                if (node.lastState.playerState.title != ""){
                                    return messageConstructor('command', {'payload': 'play'})
                                } else if (message.noTrackPhrase) {
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
        function sendMessage(messageType, message) {
            debugMessage(`WS.STATE: ${node.ws.readyState} recive ${messageType} with ${JSON.stringify(message)}`);
            if (node.ws.readyState == 1){

                    for (let m of messageConstructor(messageType, message)) {
                        let data = {
                            "conversationToken": node.device.token,
                            "id": node.device.id,
                            "payload": m,
                            "sentTime": Date.now()
                            }
                            node.ws.send(JSON.stringify(data));
                        debugMessage('Send message: ' + JSON.stringify(data));
                    }
                return 'ok'
            } else {
                return 'Device offline'
            }
        }

        
        function connect(device) {
            debugMessage('connecting...');
            getLocalToken(device)
            .then(() => {
                debugMessage('recieve conversation token...');
                let register =  node.controller.register(node.id, node.deviceId);
                debugMessage(`registered station with code ${register}`)
                if ( register == '0') {makeConn(device)}    
            })
        }
        
        async function getLocalToken(device) {
            let data;
            let options = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/token',
                qs: { device_id: device.id },
                headers: 
                    { 
                        'Authorization': 'Oauth ' + node.token,
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

        function statusUpdate(ws, options) {
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
        async function makeConn(device) {
            //let node = this
            let options = {
                key: device.glagol.security.server_private_key,
                cert: device.glagol.security.server_certificate,
                rejectUnauthorized: false
            };


            debugMessage(`Connecting to wss://${device.host}:${device.port}`);
            node.ws = new WebSocket(`wss://${device.host}:${device.port}`, options);
       
            statusUpdate(node.ws, device.address);
            //node.status({fill:"yellow",shape:"dot",text:`State ${ws.readyState}`});
            
            node.ws.on('open', function open(data) { 
                debugMessage(`Connected to ${device.host}, data: ${data}`);
                statusUpdate(node.ws);
                //node.status({fill:"green",shape:"dot",text:`State ${ws.readyState}`});
                sendMessage('command', {payload: 'ping'});
                node.watchDog = setTimeout(() => node.ws.terminate(), 10000);

    
            });
            node.ws.on('message', function incoming(data) {
                //debugMessage(data);
                node.lastState = JSON.parse(data).state; 
                node.emit('message', node.lastState);
                node.send({"payload": node.lastState});
                if (node.lastState.aliceState) {node.status({fill:"green",shape:"dot",text:`${node.lastState.aliceState}`});}
                if (node.lastState.aliceState == 'LISTENING' && node.waitForListening == true) {node.emit('stopListening')}
                clearTimeout(node.watchDog);
                node.watchDog = setTimeout(() => {
                    debugMessage(node.watchDog);
                    node.ws.terminate()}, 10000);
            });            

            node.ws.on('close', function close(code, reason){
                statusUpdate(node.ws, code)
                //node.status({fill:"red",shape:"dot",text:`disconnected ${code}`});
                //debugMessage(`close: code = ${code}, type: ${typeof(code)}, reason: ${reason}`);
                if (node.connection) {
                    switch(code) {
                        case 4000:  //invalid token
                            debugMessage(`getting new token...`);
                            connect(device);
                            break;
                        case 1000:  
                            connect(device);
                            break;   
                        case 1006:
                            debugMessage(`Lost server, reconnect in 10 seconds...${code} + ${reason}` );
                            setTimeout(connect, 10000, device);
                            break;
                        default:
                            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting in 10 seconds.` );
                            setTimeout(connect, 10000, device);
                            break;
                    }
                }
                 
                 clearTimeout(node.watchDog);
            })            
            node.ws.on('pong', function pong(data){
                //node.status({fill:"green",shape:"dot",text:"pong"});
                debugMessage(`pong: ${data}`);
            })
            node.ws.on('ping', function ping(data){
                node.ws.pong(data);

            })
            node.ws.on('error', function error(data){
                debugMessage(`error: ${data}`);
            });

            

        }


        
    }
    RED.nodes.registerType("alice-local-bridge",AliceLocalBridgeNode);
}