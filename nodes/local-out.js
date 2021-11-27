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
        node.ttsEffect = config.ttsEffect;
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
                //data.payload = input.payload;

                //apply node's config
                if (node.volumeFlag) {data.volume = node.volume/100}
                if (node.stopListening) {data.stopListening = node.stopListening}
                if (node.noTrackPhrase) {data.noTrackPhrase = node.noTrackPhrase}
                if (node.pauseMusic) {data.pauseMusic = node.pauseMusic}


                //redefine options from input
                if ("volume" in input) {data.volume = input.volume/100}
                if ("voice" in input) {node.ttsVoice = input.voice}
                if ("effect" in input) {node.ttsEffect = input.effect}
                if ("prevent_listening" in input) {node.noTrackPhrase = input.prevent_listening}
                if ("pause_music" in input) {data.pauseMusic = input.pause_music}


                if ('tts' === node.input) {
                    let payload;
                    switch (node.config.payloadType) {
                        case 'flow': {
                            if (typeof(node.context().flow.get(node.config.payload)) != "undefined") {
                                payload = node.context().flow.get(node.config.payload)
                            } else {
                                debugMessage('Empty flow context with key '+ node.config.payload)
                            }
                            break;
                        }
                        case 'global': {
                            if (typeof(node.context().global.get(node.config.payload)) != "undefined") {
                                payload = node.context().global.get(node.config.payload)
                            } else {
                                debugMessage('Empty global context with key '+ node.config.payload)
                            }
                            break;
                        
                        }
                        case 'str': {
                            payload = node.config.payload;
                            break;
                        }
                        case 'json': {
                            let arr = [];
                            
                            try {
                                arr = JSON.parse(node.config.payload)
                                payload = arr[(Math.random() * arr.length) | 0];
                            } catch (e) {
                                debugMessage("Error on parsing input JSON: "+ e);
                            }

                            break;
                        }
                        case 'msg': {
                            payload = node.input[node.config.payload]
                        }
                        default: {
                            payload = input[node.config.payload];
                            break;
                        }
                    }
                    if (typeof(payload) != "undefined" ) { 
                        data.payload = payload;
                        if (node.ttsVoice) {
                            data.payload = "<speaker voice='" + node.ttsVoice + "'>" + data.payload;
                        }
                        if (node.ttsEffect) {
                            let effectsArr = node.ttsEffect.split(',');
                            for (let ind in effectsArr) {
                                data.payload = "<speaker effect='" + effectsArr[ind] + "'>" + data.payload;
                            }
                        }
                    } else {
                        data.payload = ""
                    }
                    if (data.payload.length > 0) {node.controller.sendMessage(node.station, node.input, data)
                        debugMessage(`Sending data: station: ${node.station}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
                    } else {
                        debugMessage("Nothing to send. Check input and parameters")
                    }
                } else {
                        data.payload = input.payload;
                        data.hap = input.hap;
                        node.controller.sendMessage(node.station, node.input, data);
                        debugMessage(`Sending data: station: ${node.station}, input type: ${node.input}, data: ${JSON.stringify(data)}`);
                }
               
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
