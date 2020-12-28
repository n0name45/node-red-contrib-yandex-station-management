module.exports = function(RED) {
    function AliceLocalStationNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.station = config.station_id;
        node.debugFlag = config.debugFlag;
        node.status({});

        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        debugMessage(node.station);

        node.onStatus = function(data) {
            node.status({fill: data.color,shape:"dot",text: data.text});
        }
       

        node.on('close', () => {
            node.controller.removeListener(`statusUpdate_${node.station}`, node.onStatus) 
        });

        if (node.controller) {
            node.onStatus(node.controller.getStatus(node.station))
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus)
        }
    }
    RED.nodes.registerType("alice-local-station",AliceLocalStationNode);
}