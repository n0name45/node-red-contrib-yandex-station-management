module.exports = function(RED) {
    function AliceLocalGetNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.output = config.output;
        node.debugFlag = config.debugFlag;
        node.station = config.station_id;
        node.homekitFormat = config.homekitFormat;
        node.lastState = {};
        node.status({});

    
        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        function preparePayload(message){
            if (node.output == 'status') {
                return {'payload': message}
            } else {
                if (node.homekitFormat == 'speaker') {
                    return {'payload': {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": `${(message.playerState.subtitle) ? message.playerState.subtitle : 'No Artist'} - ${(message.playerState.title) ? message.playerState.title : 'No Track Name'}`
                    } } 
                } else {
                    return {'payload': {
                        "Active": (message.playing) ? 1 : 0
                        } 
                    } 
                }
            }
        }
        

        node.onStatus = function(data) {
            node.status({fill: `${data.color}`,shape:"dot",text: `${data.text}`});
            //node.log('new status ' + data)
         }
        node.onInput = function(){
            debugMessage('input message');
            ( 'aliceState' in node.lastState )?node.send(preparePayload(node.lastState)):node.send({'payload': {}})
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