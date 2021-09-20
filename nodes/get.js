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
        function preparePayload(message,inputMsg){
            //let payload = {};
            if (node.output == 'status') {
                inputMsg.payload = message;
            } else if (node.output == 'homekit') {
                if (node.homekitFormat == 'speaker') {
                    let ConfiguredName = `${(message.playerState.subtitle) ? message.playerState.subtitle : 'No Artist'} - ${(message.playerState.title) ? message.playerState.title : 'No Track Name'}`;
                    let title = `${message.playerState.title}`;
                    if (ConfiguredName.length > 64 && title.length > 0 && title.length <= 64) {
                        ConfiguredName = title;
                    } else {
                        ConfiguredName = title.substr(0, 61) + `...`;
                    }
                    (message.playerState)? inputMsg.payload = {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": ConfiguredName
                    } :inputMsg.payload =  {
                        "CurrentMediaState": (message.playing) ? 0 : 1,
                        "ConfiguredName": `No Artist - No Track Name`
                    }
                }else if (node.homekitFormat == 'tv') {
                    inputMsg.payload = {
                        "Active": (message.playing) ? 1 : 0
                    }

                }
            }
        return inputMsg;

        }


        node.onStatus = function(data) {
            if (data) {
                node.status({fill: `${data.color}`,shape:"dot",text: `${data.text}`});
            //node.log('new status ' + data)
            }
         }
        node.onInput = function(msg, send, done){
            debugMessage('current state: ' + JSON.stringify(node.lastState));
            ( 'aliceState' in node.lastState )?node.send(preparePayload(node.lastState,msg)):node.send(msg)
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