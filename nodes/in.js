module.exports = function(RED) {
    function AliceLocalInNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.station = config.station_id
        node.output = config.output;
        node.debugFlag = config.debugFlag;
        node.uniqueFlag = config.uniqueFlag;
        node.homekitFormat = config.homekitFormat;
        node.lastMessage = {};
        node.status({});



        debugMessage(`Node settings: ID: ${node.station}, Output Format: ${node.output}, HK: ${node.homekitFormat}`);
        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }


        function preparePayload(message){
            let payload = {};
            if (node.output == 'status') {
                   payload = {'payload': message}
            } else if (node.output == 'homekit') {
                if (node.homekitFormat == 'speaker') {
                    let ConfiguredName = `${(message.playerState.subtitle) ? message.playerState.subtitle : 'No Artist'} - ${(message.playerState.title) ? message.playerState.title : 'No Track Name'}`;
                    let title = `${message.playerState.title}`;
                    if (ConfiguredName.length > 64 && title.length > 0 && title.length <= 64) {
                        ConfiguredName = title;
                    } else {
                        ConfiguredName = title.substr(0, 61) + `...`;
                    }
                    (message.playerState)? payload = {'payload': {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": ConfiguredName
                    } }:payload = {'payload': {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": `No Artists - No Track Name`
                    } }
                }else if (node.homekitFormat == 'tv') {
                    payload = {'payload': {
                        "Active": (message.playing) ? 1 : 0
                    }
                    }
                }
            }
        return payload;

        }
        function sendMessage(message){
        //debugMessage(JSON.stringify(message));
            if (node.uniqueFlag && node.output == 'homekit') {
                if ((JSON.stringify(node.lastMessage.payload) != JSON.stringify(message.payload))) {
                    node.send(message)
                    node.lastMessage = message
                    debugMessage(`Sended message to HK: ${JSON.stringify(message)}`);

                }
            } else {
                node.send(message);
            }
        }
        node.onMessage = function(data){
            //debugMessage(JSON.stringify(data));
            sendMessage(preparePayload(data));
        }
        node.onStatus = function(data) {
            if (data) {
                node.status({fill: `${data.color}`,shape:"dot",text: `${data.text}`});
                //node.log('new status ' + data)
            }
        }
        node.onClose = function(){
            node.controller.removeListener(`message_${node.station}`, node.onMessage);
            node.controller.removeListener(`statusUpdate_${node.station}`, onStatus);
        }
        //debugMessage(`Listening for ${node.station}`);
        if (node.controller)  {
            node.onStatus(node.controller.getStatus(node.station))
            node.controller.on(`message_${node.station}`, node.onMessage);
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus);
        }

        node.on('close', node.onClose);


    }
    RED.nodes.registerType("alice-local-in",AliceLocalInNode);
}