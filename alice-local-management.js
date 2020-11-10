module.exports = function(RED) {
    function AliceLocalSendNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
           // msg.payload = msg.payload.toLowerCase();
            node.send(msg);
        });
    }
    RED.nodes.registerType("alice-local-management",AliceLocalSendNode);
}