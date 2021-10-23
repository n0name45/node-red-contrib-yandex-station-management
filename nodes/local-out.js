module.exports = function(RED) {
    function AliceLocalOutNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.config = config;
        node.controller = RED.nodes.getNode(config.token);

        node.input = config.input;
        node.station = config.station_id;
        node.debugFlag = config.debugFlag;
        node.volumeFlag = config.volumeFlag;
        node.volume = config.volume;
        node.stopListening = config.stopListening;
        node.noTrackPhrase = config.noTrack;
        node.pauseMusic = config.pauseMusic;
        node.ttsVoice = config.ttsVoice;
        node.status({});

        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        debugMessage(node.station);
        node.on('input', (input) => {
            debugMessage(`input: ${JSON.stringify(input)}`)

            if (node.station) {
                var data = {};

                //apply node's config
                if (node.volumeFlag) {data.volume = node.volume/100}
                if (node.stopListening) {data.stopListening = node.stopListening}
                if (node.noTrackPhrase) {data.noTrackPhrase = node.noTrackPhrase}
                if (node.pauseMusic) {data.pauseMusic = node.pauseMusic}


                //redefine options from input
                if ("volume" in input) {data.volume = input.volume/100}
                if ("voice" in input) {node.ttsVoice = input.voice}
                if ("prevent_listening" in input) {node.noTrackPhrase = input.prevent_listening}
                if ("pause_music" in input) {data.pauseMusic = input.pause_music}

                let payload;
                switch (node.config.payloadType) {
                    case 'flow':
                    case 'global': {
                        RED.util.evaluateNodeProperty(node.config.payload, node.config.payloadType, this, message, function (error, result) {
                            if (error) {
                                node.error(error, message);
                            } else {
                                payload = result;
                            }
                        });
                        break;
                    }
                    case 'str': {
                        payload = node.config.payload;
                        break;
                    }
                    case 'json': {
                        var arr = JSON.parse(node.config.payload);
                        payload = arr[(Math.random() * arr.length) | 0];
                        break;
                    }
                    case 'msg':
                    default: {
                        payload = input[node.config.payload];
                        break;
                    }
                }
                data.payload = payload;

                if (node.ttsVoice) {
                    data.payload = "<speaker voice='"+node.voice+"'>" + data.payload;
                }
                node.controller.sendMessage(node.station, node.input, data);
                debugMessage(`Sending data: station: ${node.station}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
            } else {
                debugMessage('node.station is empty');
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