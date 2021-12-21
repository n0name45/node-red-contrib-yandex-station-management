'use strict';

class stationHelper {

  static preparePayload(node, message) {
    let payload = {};
    if (node.output == 'status') {
      payload = { 'payload': message }
    } else if (node.output == 'homekit') {
      let playing = false;
      if (typeof(message.playing) !== 'undefined') {
        playing = message.playing;
      }
      if (node.homekitFormat == 'speaker') {
        let subtitle = 'No Artist';
        let title    = 'No Track Name';

        if (typeof(message.playerState) !== 'undefined') {
          let playerState = message.playerState;
          if (typeof(playerState.subtitle) !== 'undefined') {
            subtitle = playerState.subtitle;
          }
          if (typeof(playerState.title) !== 'undefined') {
            title = playerState.title;
          }
        }

        let ConfiguredName = `${subtitle} - ${title}`;
        if (ConfiguredName.length > 64) {
          ConfiguredName = title.length <= 64 ? title : title.substr(0, 61) + `...`;
        }

        payload = {
          'payload': {
            'CurrentMediaState': (playing) ? 0 : 1,
            'ConfiguredName': ConfiguredName
          }
        }
      } else if (node.homekitFormat == 'tv') {
        payload = {
          'payload': {
            'Active': (playing) ? 1 : 0
          }
        }
      }
    }
    return payload;
  }

}

module.exports = stationHelper;