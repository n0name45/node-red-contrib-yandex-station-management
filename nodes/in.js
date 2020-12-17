module.exports = function(RED) {
    function AliceLocalInNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.station = config.station_id
        node.output = config.output;
        node.debugFlag = config.debugFlag;
        node.uniqueFlag = config.uniqueFlag;
        node.lastMessage = {};
        node.status({});
        

       
        debugMessage(`Node settings: ID: ${node.station}, Output Format: ${node.output}`);
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
                    } }
            }
        }
        function sendMessage(message){
            if (node.uniqueFlag) {
                if (node.output == 'homekit' && (JSON.stringify(node.lastMessage.payload) != JSON.stringify(message.payload))) {
                    node.send(message)
                    node.lastMessage = message
                    debugMessage(`Sended message to HK: ${message}`);     
                
                }
            } else {
                node.send(message);
            }
        }
        node.onMessage = function(data){
            //debugMessage('input message');
            sendMessage(preparePayload(data));
        }
        node.onStatus = function(data) {
           node.status({fill: `${data.color}`,shape:"dot",text: `${data.text}`});
           //node.log('new status ' + data)
        }
        node.onClose = function(){
            node.controller.removeListener(`message_${node.station}`, node.onMessage);
            node.controller.removeListener(`statusUpdate_${node.station}`, onStatus);
        }
        debugMessage(`Listening for ${node.station}`);
        if (typeof node.controller !== "undefined")  {
            node.onStatus(node.controller.getStatus(node.station))
            node.controller.on(`message_${node.station}`, node.onMessage);
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus);
        }
       
        node.on('close', node.onClose);


    }
    RED.nodes.registerType("alice-local-in",AliceLocalInNode);
}