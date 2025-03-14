module.exports = {
  set alert(value) {
    this.aps.alert = value;
  },

  get body() {
    if (this.aps.alert) {
      return this.aps.alert.body || this.aps.alert;
    }
    return this.aps.alert;
  },

  set body(value) {
    if (typeof this.aps.alert !== 'object') {
      this.aps.alert = value;
    } else {
      this.prepareAlert();
      this.aps.alert.body = value;
    }
  },

  set locKey(value) {
    this.prepareAlert();
    this.aps.alert['loc-key'] = value;
  },

  set locArgs(value) {
    this.prepareAlert();
    this.aps.alert['loc-args'] = value;
  },

  set title(value) {
    this.prepareAlert();
    this.aps.alert.title = value;
  },

  set subtitle(value) {
    this.prepareAlert();
    this.aps.alert.subtitle = value;
  },

  set titleLocKey(value) {
    this.prepareAlert();
    this.aps.alert['title-loc-key'] = value;
  },

  set titleLocArgs(value) {
    this.prepareAlert();
    this.aps.alert['title-loc-args'] = value;
  },

  set subtitleLocKey(value) {
    this.prepareAlert();
    this.aps.alert['subtitle-loc-key'] = value;
  },

  set subtitleLocArgs(value) {
    this.prepareAlert();
    this.aps.alert['subtitle-loc-args'] = value;
  },

  set action(value) {
    this.prepareAlert();
    this.aps.alert.action = value;
  },

  set actionLocKey(value) {
    this.prepareAlert();
    this.aps.alert['action-loc-key'] = value;
  },

  set launchImage(value) {
    this.prepareAlert();
    this.aps.alert['launch-image'] = value;
  },

  set badge(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps.badge = value;
    }
  },

  set sound(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps.sound = value;
    } else if (
      typeof value === 'object' &&
      typeof value.name === 'string' &&
      typeof value.critical === 'number' &&
      typeof value.volume === 'number'
    ) {
      this.aps.sound = value;
    }
  },

  set relevanceScore(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps['relevance-score'] = value;
    }
  },

  set timestamp(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps.timestamp = value;
    }
  },

  set staleDate(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps['stale-date'] = value;
    }
  },

  set event(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps.event = value;
    }
  },

  set contentState(value) {
    if (typeof value === 'object' || value === undefined) {
      this.aps['content-state'] = value;
    }
  },

  set dismissalDate(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps['dismissal-date'] = value;
    }
  },

  set contentAvailable(value) {
    if (value === true || value === 1) {
      this.aps['content-available'] = 1;
    } else {
      this.aps['content-available'] = undefined;
    }
  },

  set mutableContent(value) {
    if (value === true || value === 1) {
      this.aps['mutable-content'] = 1;
    } else {
      this.aps['mutable-content'] = undefined;
    }
  },

  set mdm(value) {
    this._mdm = value;
  },

  set urlArgs(value) {
    if (Array.isArray(value) || value === undefined) {
      this.aps['url-args'] = value;
    }
  },

  set category(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps.category = value;
    }
  },

  set targetContentIdentifier(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['target-content-id'] = value;
    }
  },

  set threadId(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['thread-id'] = value;
    }
  },

  set interruptionLevel(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['interruption-level'] = value;
    }
  },

  set filterCriteria(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['filter-criteria'] = value;
    }
  },

  set inputPushChannel(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['input-push-channel'] = value;
    }
  },

  set inputPushToken(value) {
    if (typeof value === 'number' || value === undefined) {
      this.aps['input-push-token'] = value;
    }
  },

  set attributesType(value) {
    if (typeof value === 'string' || value === undefined) {
      this.aps['attributes-type'] = value;
    }
  },

  set attributes(value) {
    if (typeof value === 'object' || value === undefined) {
      this.aps['attributes'] = value;
    }
  },

  prepareAlert: function () {
    if (typeof this.aps.alert !== 'object') {
      this.aps.alert = { body: this.aps.alert };
    }
  },
};
