function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function eventName(event, lang) {
  return event[`name${capitalize(lang)}`] || event.nameIt;
}

function eventDescription(event, lang) {
  return event[`description${capitalize(lang)}`] || event.descriptionIt || '';
}

const TYPE_TO_I18N_KEY = {
  SOLO_ANDATA: 'oneWayOutbound',
  SOLO_RITORNO: 'oneWayReturn',
  ANDATA_RITORNO: 'roundTrip',
};

module.exports = { eventName, eventDescription, TYPE_TO_I18N_KEY };
