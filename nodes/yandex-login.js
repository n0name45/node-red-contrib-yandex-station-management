var rp = require('request-promise');
var mDnsSd = require('node-dns-sd');
var WebSocket = require("ws");
const { parse } = require('node-dns-sd/lib/dns-sd-parser');

module.exports = function(RED) {

    function YandexLoginNode(config) {
        RED.nodes.createNode(this,config);
        let node = this
        node.token = this.credentials.token;
        node.getStatus = getStatus;
        node.sendMessage = sendMessage;
        node.registerDevice = registerDevice;
        node.unregisterDevice = unregisterDevice;
        node.debugFlag = config.debugFlag;
        node.deviceList = [];
        node.readyList = [];
        node.activeStationList = [];
        
        
       
        node.on('stopListening', onStopListening);
        node.on('startPlay', onStartPlay);
        node.on('stopPlay', onStopPlay);
        node.on('deviceReady', onDeviceReady);
        node.setMaxListeners(0)
        
        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        
        let registrationBuffer = [];
    
        function deviceListProcessing(deviceList) {
            deviceList.forEach(device => {
                if (device.address && device.port ) {
                   
                     if (node.readyList.find(item => item.id == device.id)){
                        //debugMessage('skipping');
                    } else {
                        node.emit(`deviceReady`, device);
                        node.readyList.push({ 'name': device.name,  'id': device.id, 'platform': device.platform, 'address': device.address, 'port': device.port, 'host': device.host, 'parameters': device.parameters});
                        node.emit('refreshHttp', node.activeStationList, node.readyList)
                        statusUpdate({"color": "yellow", "text": "connecting..."}, device);
                    }
                }
            });
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
                node.activeStationList = [];
                //registartion queue processing
                node.deviceList.forEach(device => {
                    //сразу задать стартовой значение набора парметров ={}, чтобы потом проверять их наличие в рамках всей программы.
                    if (device.parameters == undefined) { device.parameters = {} };
                    let bufferStation = registrationBuffer.find(el => el.id == device.id )
                    if (bufferStation) {
                        let result = registerDevice(bufferStation.id, bufferStation.manager, bufferStation.parameters)
                        if (result != 2 && result != undefined)  {
                            registrationBuffer.splice(registrationBuffer.indexOf(bufferStation,1));
                        }
                        
                    }
                        node.activeStationList.push({ 'name': device.name,  'id': device.id, 'platform': device.platform, 'address': device.address, 'port': device.port});
                });
                //node.emit('refreshHttp', node.activeStationList, node.readyList)
                deviceListProcessing(node.deviceList)

                discoverDevices(node.deviceList)
                .then(() => {
                    debugMessage(`calling processing for ${node.deviceList.length} devices`);
                    deviceListProcessing(node.deviceList)
                   
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
                            let checkConnType = device.parameters.network || {}
                            //если режим автоопределения адреса или набор параметров пустой, то записывать значния из результатов mdns поиска
                            if (checkConnType.mode == "auto" || JSON.stringify(checkConnType) == "{}") {
                                let srvEls = element.packet.answers.find(el => el.type == "SRV");
                                let txtEls = element.packet.answers.find(el => el.type == "TXT");
                                if (typeof(txtEls) != undefined ) {
                                    if (txtEls.rdata.deviceId == device.id) {
                                        device.address =  element.address;
                                        device.port = element.service.port;
                                        device.host = srvEls.rdata.target;
                                    }
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

        function onDeviceReady(device) {
            debugMessage(`recieved event devicesListReady for ${device.id}!`)
            connect(device)
        };

        
        function connect(device) {
            //connect only if !device.ws
            //debugMessage(`device.ws = ${JSON.stringify(device.ws)}`);
            if (device.connection == true || typeof(device.connection) == "undefined") {
                if (!device.ws) {
                    debugMessage('recieving conversation token...');
                    getLocalToken(device)
                    .then(() => {
                        if (device.address && device.port) {
                            makeConn(device)
                        } else {
                            debugMessage(`address is ${device.address}, port is ${device.port}`);
                        }
                    })
                    .catch(function (err) {
                        debugMessage('Error while getting token: ' + err);
        
                    });
                } else {
                    if (device.ws.readyState == 3) {
                        debugMessage(`ws.state: ${device.ws.readyState}`);
                        //device.ws = undefined;
                        try {
                            if (device.address && device.port) {
                                getLocalToken(device)
                                .then(() => {
                                    if (device.address && device.port) {
                                        makeConn(device)
                                    } else {
                                        debugMessage(`address is ${device.address}, port is ${device.port}`);
                                    }
                                })
                            } else {
                                debugMessage(`address is ${device.address}, port is ${device.port}`);
                            }
                        } catch (error) {
                            debugMessage(`Error: ${error}`);
                            device.ws = undefined;
                            connect(device);
                        }
                       //connect(device);
                    } //else {
                    //    debugMessage('cannot reconnect... Try in 60 seconds. WS=' + device.ws.readyState);
                    //    setTimeout(connect, 60000, device);

                    //}
                }
            } else {
                debugMessage(`${device.id} connection is disabled by settings in manager node ${device.manager}`)
                statusUpdate({"color": "red", "text": "disconnected"}, device);
                setTimeout(connect, 60000, device);

            }

        }
        
        async function makeConn(device) {
           
            let options = {
                key: device.glagol.security.server_private_key,
                cert: device.glagol.security.server_certificate,
                rejectUnauthorized: false
            };
            device.lastState = {};
            debugMessage(`Connecting to wss://${device.address}:${device.port}`);
            device.ws = new WebSocket(`wss://${device.address}:${device.port}`, options);
            device.ws.on('open', function open(data) { 
                debugMessage(`Connected to ${device.address}, data: ${data}`);
                sendMessage(device.id, 'command', {payload: 'ping'});
                statusUpdate({"color": "green", "text": "connected"}, device);
                debugMessage(`connection of ${device.id} success!`);
                device.waitForListening = false;
                device.playAfterTTS = false;
                device.watchDog = setTimeout(() => device.ws.close(), 10000);
                device.pingInterval = setInterval(onPing,300,device)
            });
            device.ws.on('message', function incoming(data) {
                //debugMessage(`${device.id}: ${JSON.stringify(data)}`);
                let dataRecieved = JSON.parse(data);
                device.lastState = dataRecieved.state; 
                //debugMessage(checkSheduler(device, JSON.parse(data).sentTime));
                node.emit(`message_${device.id}`, device.lastState);
                if (device.lastState.aliceState == 'LISTENING' && device.waitForListening) {node.emit(`stopListening`, device)}
                if (device.lastState.aliceState == 'LISTENING' && device.playAfterTTS) {node.emit('startPlay', device)}
                // if (device.parameters.hasOwnProperty(sheduler)) {
                //     let resultSheduler = checkSheduler(device, dataRecieved.sentTime)
                //     device.canPlay = resultSheduler[0]
                //     if (device.canPlay == false) {
                //         node.emit('stopPlay', device, res[1])
                //     }
                // }


                if (device.lastState.playing && device.lastState.aliceState != 'LISTENING' && device.parameters.hasOwnProperty("sheduler")) {
                    let res = checkSheduler(device, dataRecieved.sentTime)
                    //debugMessage(`Result of cheking sheduler is ${res.toString}`);
                    if (!res[0]) {    
                        if (device.shedulerFlag || device.shedulerFlag == undefined) {
                            node.emit('stopPlay', device, res[1])
                            device.shedulerFlag  = false
                            setTimeout(() => {device.shedulerFlag = true}, 5000)
                        }
                    }

                }
                clearTimeout(device.watchDog);
                //debugMessage(`cleared timeout for ${device.id}`)
                device.watchDog = setTimeout(() => {device.ws.close()}, 10000);
            }); 
            //device.ws.on('ping', function);
            device.ws.on('close', function close(code, reason){
                statusUpdate({"color": "red", "text": "disconnected"}, device);
                device.lastState = {};
                clearTimeout(device.watchDog);
                    switch(code) {
                        case 4000:  //invalid token
                            debugMessage(`getting new token...`);
                            connect(device);
                            break;
                        case 1000:  
                            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting...` );
                            connect(device);
                            break;   
                        case 1006:
                            debugMessage(`Lost server, reconnect in 60 seconds...${code} + ${reason}` );
                            setTimeout(connect, 60000, device);
                            break;
                            
                        case 10000:
                            debugMessage(`Reconnect device reason 10000 ${device.id}`);
                            connect(device);
                            break;
                        default:
                            debugMessage(`Closed connection code ${code} with reason ${reason}. Reconnecting in 60 seconds.` );
                            setTimeout(connect, 60000, device);
                            break;
                    }


            })            
            device.ws.on('error', function error(data){
                //statusUpdate({"color": "red", "text": "disconnected"}, device);
                debugMessage(`error: ${data}`);
                device.ws.terminate();
                // if (device.localConnectionFlag) {
                //     debugMessage(`Reconnecting in 60 seconds...` );
                //     setTimeout(connect, 60000, device);
                // }
            });
        };

        function reconnect(device) {
            //проверить текущий статус соединения ws.status

            if (device.ws) {
                if (device.ws.readyState == 1 || device.ws.readyState == 0) {
                    debugMessage(`${device.id} device.ws.readyState is ${device.ws.readyState}`);
                    device.ws.close();
                } else {
                    debugMessage(`New connection to ${device.id}`);
                    connect(device)
                }
            } else {
                debugMessage(`nothing to reconnect...`);
            }
        };

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
                        messageConstructor('command', {'payload': 'stop'}).forEach(item => result.push(item))
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
                            case '{"Active":0}':
                                return messageConstructor('command', {'payload': 'stop'})
                            case '{"TargetMediaState":0}':
                            case '{"Active":1}':
                                if (!device.lastState.playerState && !device.playAfterTTS && message.noTrackPhrase) {
                                    return messageConstructor('voice', {'payload': message.noTrackPhrase})
                                } else if (device.lastState.playerState.title != "" && !device.playAfterTTS){
                                    return messageConstructor('command', {'payload': 'play'})
                                } else if (message.noTrackPhrase && !device.playAfterTTS) {
                                    return messageConstructor('voice', {'payload': message.noTrackPhrase})
                                } else {
                                    return messageConstructor('command', {'payload': 'ping'})
                                }
                            case '{"RemoteKey":7}':
                                return messageConstructor('command', {'payload': 'forward'}, device)
                            case '{"RemoteKey":6}':
                                return messageConstructor('command', {'payload': 'backward'}, device)
                            case '{"RemoteKey":4}':
                                return messageConstructor('command', {'payload': 'next'})
                            case '{"RemoteKey":5}':
                                return messageConstructor('command', {'payload': 'prev'})
                            case '{"RemoteKey":11}':
                                if (typeof device.lastState.playing !== "undefined") {
                                    if (device.lastState.playing){
                                        return messageConstructor('command', {'payload': 'stop'})
                                    } else {
                                        return messageConstructor('command', {'payload': 'play'})
                                    }
                                }
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
            
            try {
                let device = searchDeviceByID(deviceId);
                //debugMessage(`deviceId: ${searchDeviceByID(deviceId)}`);
                //debugMessage(`WS.STATE: ${(device.ws)?device.ws.readyState:'no device'} recieve ${messageType} with ${JSON.stringify(message)}`);
                if (device && device.ws) {
                    if (device.ws.readyState == 1){

                            for (let m of messageConstructor(messageType, message, device)) {
                                let data = {
                                    "conversationToken": device.token,
                                    "id": device.id,
                                    "payload": m,
                                    "sentTime": Date.now()
                                    }
                                    device.ws.send(JSON.stringify(data));
                                //debugMessage('Send message: ' + JSON.stringify(data));
                            }
                        return 'ok'
                    } else {
                        return 'Device offline'
                    }
                }
            } catch(err) {
                debugMessage(`Shit happens while sending message: ${err}`);
            }
        }
        function checkSheduler(device, timestamp) {
            let sheduler = (JSON.stringify(device.parameters) != "{}")?device.parameters.sheduler:[];
            let date = new Date(timestamp);
            let timeCurrent = date.getDay()*1000 + date.getHours()*60 + date.getMinutes();
            let daySheduler = sheduler.find(el => el.dayNumber == date.getDay())
            let timeMin = daySheduler.dayNumber*1000 + parseInt(daySheduler.from)
            let timeMax = daySheduler.dayNumber*1000 + parseInt(daySheduler.to)
            if (timeCurrent >= timeMin && timeCurrent < timeMax) {
                //debugMessage(`timeCur: ${timeCurrent} timeMin: ${timeMin} timeMax: ${timeMax}`);
                return [true];
            } else {
                //debugMessage(`timeCur: ${timeCurrent} timeMin: ${timeMin} timeMax: ${timeMax}`);
                return [false, daySheduler.phrase];
            }
            

        }
        
        function searchDeviceByID(id) {
            if (node.deviceList) {
                return node.deviceList.find(device => device.id == id)
            }   
        }
        function onPing(device) {
            if (device) {sendMessage(device.id, 'command', {payload: 'ping'});}
        }
        
        function onPing(device) {
            sendMessage(device.id, 'command', {payload: 'ping'});
        }
        function getStatus(id) {
            let device = searchDeviceByID(id);
            if (device) {
                if (device.ws) {
                    switch(device.ws.readyState){
                        case 0: 
                            return {"color": "yellow", "text": "connecting..."}
                        case 1: 
                            return {"color": "green", "text": "connected"}
                        case 2: 
                            return {"color": "red", "text": "disconnecting"}
                        case 3: 
                            return {"color": "red", "text": "disconnected"}
                        default:
                            return {"color": "red", "text": "disconnected"}
                    }
                     
                } 
            } else {
                return {"color": "red", "text": "disconnected"}
            }

        }


        
        function registerDevice(deviceId, nodeId, parameters) {
            let device = searchDeviceByID(deviceId);
            debugMessage(`Recieved parameters ${JSON.stringify(parameters)} for station id ${deviceId}`);
            if (device) {
                debugMessage(`Recieved device id is ${deviceId}, nodeID is ${nodeId}. Current device manager is ${device.manager} with parameters ${JSON.stringify(device.parameters)}`);
                //если запрос пришел от той же управляющей ноды. А оно сюда вообще попадает?
                if (device.manager == nodeId) {
                    device.parameters = parameters;
                    debugMessage(`Device ${device.id} already registered with manager id ${device.manager}. Updating parameters and restart...`);
                    reconnect(device);
                    return 1;
                                  
                }
                //новый и первый запрос на регистрацию для устройства
                if (typeof(device.manager) == 'undefined') {
                    device.manager = nodeId;
                    device.parameters = parameters;
                    debugMessage(`Parameters are: ${JSON.stringify(device.parameters)}`);
                    if (device.parameters.network) {
                        if (device.mode == 'manual') {
                            device.address = undefined;
                            device.port = undefined;
                        }
                        device.mode = device.parameters.network.mode;
                        (device.parameters.network.fixedAddress.length > 0 && device.parameters.network.mode == "manual")?device.address = device.parameters.network.fixedAddress:undefined;
                        (device.parameters.network.fixedPort.length > 0 && device.parameters.network.mode == "manual")?device.port = device.parameters.network.fixedPort:undefined;
                        if (device.parameters.network.mode == "auto") {removeDevice(node.readyList, device)}
                        debugMessage(`Network parameters: ${JSON.stringify(device.parameters.network)}`)
                    }
                    (device.parameters.connection == false)?device.connection = false:device.connection = true;
                    //if (device.parameters.connection)
                    debugMessage(`For device ${deviceId} was succesfully registred managment node whith id ${device.manager}`)
                    //statusUpdate({"color": "green", "text": "registered"}, device);
                    //удалить запись из буффера при регистрации
                    let currentBuffer = registrationBuffer.find(el => el.manager == nodeId);
                    debugMessage(`Current buffer is ${currentBuffer}. Current buffer size is ${registrationBuffer.length}`)
                    if (currentBuffer) {
                        registrationBuffer.splice(registrationBuffer.indexOf(currentBuffer), 1)
                        debugMessage(`Element from registration buffer was deleted. Current buffer size is ${registrationBuffer.length}`)
                    }
                    reconnect(device);    
                    return 0;
                }
                //новый запрос на регистрацию при наличии уже зарегистрированной ноды
                if (device.manager != nodeId) {
                    debugMessage(`For device ${deviceId} there is already registrated managment node whith id ${device.manager}`)
                    //statusUpdate({"color": "red", "text": "not registered"}, device);
                    return 2;
                }


            } else {
                // пришел запрос на регистрацию для устройства, которого еще нет. Прибираем в буферный список, который проверятся при появлении утсройств
                if (!registrationBuffer.find(el => el.manager == nodeId)) {
                    //регистрировать запрос от первого, остальных слать
                    registrationBuffer.push({"id": deviceId, "manager": nodeId, "parameters": parameters});
                    debugMessage(`New element in registration buffer. Current buffer size is ${registrationBuffer.length}`)
                }
                
            }
           

        }
        function unregisterDevice(deviceId, nodeId){
            let device = searchDeviceByID(deviceId);
            if (device) {
                if (device.manager == nodeId) {
                    device.manager = undefined;
                    device.parameters = {};
                    debugMessage(`For device ${deviceId} was succesfully unregistred managment node whith id ${device.manager}`);
                    debugMessage(`device is: ${device}`);
                    return 0;              
                } else {
                    return 2;
                }
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
        function onStopPlay(device, phrase) {
            sendMessage(device.id, 'command', {payload: 'stop'});
            if (phrase.length > 0 && device.lastState.aliceState != 'SPEAKING') {sendMessage(device.id, 'tts', {payload: phrase, stopListening: true});}
        }
        
        function onClose() {
            clearInterval(node.interval);
            node.deviceList = [];
            node.removeListener('deviceReady', onDeviceReady)
        }
        
        node.on('refreshHttp', function(activeList, readyList) {
            RED.httpAdmin.get("/yandexdevices_"+node.id, RED.auth.needsPermission('yandex-login.read'), function(req,res) {
                res.json({"devices": readyList});
            });
            RED.httpAdmin.get("/stations/"+node.id, RED.auth.needsPermission('yandex-login.read'), function(req,res) {
                res.json({"devices": activeList});
            });
        });
        node.on('close', onClose)


        //API for station node
        // RED.httpAdmin.post("/station/" + node.id + "/fixaddress", RED.auth.needsPermission('yandex-login.write'), function(req, res) {
        //     debugMessage(JSON.stringify(req.body));
        //     onFixAddr(req.body);
        //     res.json({ status: 'success' });
        // });
        RED.httpAdmin.get("/station/:id", RED.auth.needsPermission('yandex-login.read'), function(req,res) {
            let id = req.params.id;
            let device = searchDeviceByID(id);
            if (device) {

                res.json({"id": device.id,"name": device.name, "platform": device.platform, "address": device.address, "port": device.port, "manager": device.manager, "ws": device.ws, "parameters": device.parameters});
            } else {
                res.json({"error": 'no device found'});
            }
        });
        
        // main init
        if (typeof(node.token) != 'undefined') {
            getDevices(node.token);
            node.interval = setInterval(getDevices, 60000, node.token);
        }


    }

    RED.nodes.registerType('yandex-login', YandexLoginNode, {
        credentials: {
            token: {type:"text"}
        }
    });

}