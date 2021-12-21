module.exports = function(RED) {
    const stationHelper = require('../lib/stationHelper.js');

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

        function _preparePayload(message, inputMsg) {
            let prepare = stationHelper.preparePayload(node, message);
            if (typeof(prepare.payload) !== 'undefined') {
                inputMsg.payload = prepare.payload;
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
            ( 'aliceState' in node.lastState )?node.send(_preparePayload(node.lastState,msg)):node.send(msg)
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