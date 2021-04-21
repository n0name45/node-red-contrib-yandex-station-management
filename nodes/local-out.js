module.exports = function(RED) {
    function AliceLocalOutNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.input = config.input;
        node.station = config.station_id;
        node.debugFlag = config.debugFlag;
        node.volumeFlag = config.volumeFlag;
        node.volume = config.volume;
        node.stopListening = config.stopListening;
        node.noTrackPhrase = config.noTrack;
        node.pauseMusic = config.pauseMusic;
        node.status({});

        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        debugMessage(node.station);
        node.on('input', (data) => {
            debugMessage(`input: ${JSON.stringify(data)}`)
            if (node.volumeFlag) {data.volume = node.volume}
            if (node.stopListening) {data.stopListening = node.stopListening}
            if (node.noTrackPhrase) {data.noTrackPhrase = node.noTrackPhrase}
            if (node.pauseMusic) {data.pauseMusic = node.pauseMusic}
            if (node.station) {
                node.controller.sendMessage(node.station, node.input, data);
                debugMessage(`Sending data: station: ${node.station}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
            }
        });

        node.onStatus = function(data) {
            debugMessage(`Status: ${JSON.stringify(data)}`);
            if (data) {
                node.status({fill: data.color,shape:"dot",text: data.text});
            }
        }
       

        node.on('close', () => {
            node.controller.removeListener(`statusUpdate_${node.station}`, node.onStatus) 
        });

        if (node.controller) {
            node.onStatus(node.controller.getStatus(node.station))
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus)
        }
    }
    RED.nodes.registerType("alice-local-out",AliceLocalOutNode);
}