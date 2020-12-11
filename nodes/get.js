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
                    return {'payload': {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": `${(message.playerState.subtitle) ? message.playerState.subtitle : 'No Artist'} - ${(message.playerState.title) ? message.playerState.title : 'No Track Name'}`
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
        node.controller.on(`message_${node.station}`, node.onMessage)
        node.controller.on(`statusUpdate_${node.station}`, node.onStatus)
        node.on('close', node.onClose)

        if (node.controller) {
            node.onStatus(node.controller.getStatus(node.station))
        }
    }
    RED.nodes.registerType("alice-local-get",AliceLocalGetNode);
}