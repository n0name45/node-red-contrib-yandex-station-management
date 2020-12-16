module.exports = function(RED) {
    function AliceLocalGetNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.output = config.output;
        node.debugFlag = config.debugFlag;
        node.station = config.station_id;
        node.lastState = {};
        node.status({});

    
        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        function preparePayload(message){
            switch(node.output){
                case 'status':
                    return {'payload': message}
                case 'homekit':
                    let currentState = 1;
                    let configuredName = '';
                    if (typeof message.playing !== "undefined") {
                        if (message.playing == true) {
                            currentState = 0;
                        } else {
                            currentState = 1;
                        }
                    }
                    if (typeof message.playerState.subtitle !== "undefined") {
                       configuredName = configuredName + message.playerState.subtitle
                    } else {
                        configuredName = configuredName + 'No Artist - '
                    }
                    if (typeof message.playerState.title !== "undefined") {
                        configuredName = configuredName + message.playerState.title
                    } else {
                        configuredName = configuredName + 'No Track'
                    }
                    return {'payload': {
                        "CurrentMediaState": currentState,
                        "ConfiguredName": configuredName
                    }
                };
            }
        }

        node.onStatus = function(data) {
            node.status({fill: `${data.color}`,shape:"dot",text: `${data.text}`});
            //node.log('new status ' + data)
         }
        node.onInput = function(){
            debugMessage('input message');
            node.send(preparePayload(node.lastState));
        }
        node.onMessage = function(message){
            node.lastState = message;
        }
        node.onClose = function(){
            node.controller.removeListener(`message_${node.station}`, node.onMessage)
        }
        
        node.on('input', node.onInput);

        node.on('close', node.onClose)

        if (node.controller) {
            node.onStatus(node.controller.getStatus(node.station))
            node.controller.on(`message_${node.station}`, node.onMessage)
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus)
        }
    }
    RED.nodes.registerType("alice-local-get",AliceLocalGetNode);
}