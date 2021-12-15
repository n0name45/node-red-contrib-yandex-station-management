'use strict';

const _ = require('lodash/object');

class stationHelper {

  static preparePayload(node, message) {
    let payload = {};
    if (node.output == 'status') {
      payload = { 'payload': message }
    } else if (node.output == 'homekit') {
      let playing = _.get(message, 'playing', false);
      if (node.homekitFormat == 'speaker') {
        let subtitle = _.get(message, 'playerState.subtitle', 'No Artist');
        let title = _.get(message, 'playerState.title', 'No Track Name');

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