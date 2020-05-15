/* 
This will be updated! Be careful! Things to do:
[x] move away from lodash to native methods
    -> tested, working
[ ] move request methods to axios as request is now deprecated
    [x] setHeatSetpoint
        -> tested, works
    [x] setSystemMode
        -> tested, works
    [x] _request
        -> tested, works
    [x] _renew
        -> tested, works
    [x] login
        -> tested, works
    [x] getUserInfo
        -> tested, works
[x] modernize constructor functions into modern classes
    -> tested, working
*/

const axios = require("axios");

// Private
let sessionCredentials = {};

const oauthUrl = "https://tccna.honeywell.com/Auth/OAuth/Token";
const apiUrl = "https://tccna.honeywell.com/WebAPI/emea/api/v1";

class UserInfo {
  constructor(json) {
    this.userID = json.userId;
    this.username = json.username;
    this.firstname = json.firstname;
    this.lastname = json.lastname;
    this.streetAddress = json.streetAddress;
    this.city = json.city;
    this.postcode = json.postcode;
    this.country = json.country;
    this.language = json.language;
  }
}

class Session {
  constructor(username, password, json, userinfo) {
    this.sessionId = "bearer " + json.access_token;
    this.refreshToken = json.refresh_token;
    this.refreshTokenInterval = json.expires_in - 30; // refresh token 30 seconds before expiry
    this.userInfo = new UserInfo(userinfo);
    sessionCredentials[this.sessionId] = {
      username: username,
      password: password,
    };
  }

  getLocations() {
    const url =
      apiUrl +
      "/location/installationInfo?userId=" +
      this.userInfo.userID +
      "&includeTemperatureControlSystems=True";
    return this.requestData(url).then(function (json) {
      return json.map((location) => new Location(location));
    });
  }

  getThermostats(locationId) {
    const url =
      apiUrl + "/location/" + locationId + "/status?includeTemperatureControlSystems=True";
    return this.requestData(url).then(function (json) {
      return json.gateways[0].temperatureControlSystems[0].zones.map((t) => {
        // logging thermostats to console
        // is there battery information?
        console.log(t.activeFaults);
        return new Thermostat(t);
      });
    });
  }

  getSystemModeStatus(locationId) {
    const url =
      apiUrl + "/location/" + locationId + "/status?includeTemperatureControlSystems=True";
    return this.requestData(url).then(function (json) {
      return new SystemModeStatus(json.gateways[0].temperatureControlSystems[0].systemModeStatus);
    });
  }

  getSchedule(zoneId) {
    const url = apiUrl + "/temperatureZone/" + zoneId + "/schedule";
    return this.requestData(url).then(function (json) {
      return json.dailySchedules.map((s) => new Schedule(s));
    });
  }

  setHeatSetpoint(zoneId, targetTemperature, endTime) {
    const url = apiUrl + "/temperatureZone/" + zoneId + "/heatSetpoint";
    const now = new Date();
    let body;
    if (endTime != null) {
      if (endTime == "00:00:00") {
        now.setDate(now.getDate() + 1);
      }
      const endDateString = now.toDateString() + " " + endTime;
      const endDate = new Date(Date.parse(endDateString));
      body = JSON.stringify({
        HeatSetpointValue: targetTemperature,
        SetpointMode: "TemporaryOverride",
        TimeUntil: endDate,
      });
    } else {
      // if target temperature is set to zero then we ask to follow the schedule instead of setting a temperature
      if (targetTemperature == 0) {
        body = JSON.stringify({
          HeatSetpointValue: 0.0,
          SetpointMode: "FollowSchedule",
          TimeUntil: null,
        });
      } else {
        body = JSON.stringify({
          HeatSetpointValue: targetTemperature,
          SetpointMode: "PermanentOverride",
          TimeUntil: null,
        });
      }
    }
    const options = {
      headers: {
        "Content-Type": "application/json",
        Authorization: this.sessionId,
      },
    };
    return axios
      .put(url, body, options)
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  setSystemMode(systemId, systemMode) {
    const url = apiUrl + "/temperatureControlSystem/" + systemId + "/mode";
    const body = JSON.stringify({
      SystemMode: systemMode,
      TimeUntil: null,
      Permanent: true,
    });
    const options = {
      headers: {
        "Content-Type": "application/json",
        Authorization: this.sessionId,
      },
    };
    return axios
      .put(url, body, options)
      .then((response) => response.body)
      .catch((error) => {
        throw error;
      });
  }

  renewToken() {
    // const or let?
    var self = this;

    const body = "grant_type=refresh_token&refresh_token=" + self.refreshToken;
    const options = {
      headers: {
        Authorization:
          "Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==",
        "Content-Type": "application/x-www-form-urlencoded",
        Connection: "Keep-Alive",
        "Cache-Control": "no-store no-cache",
        Pragma: "no-cache",
      },
    };
    return axios
      .post(oauthUrl, body, options)
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }

  requestData(url) {
    const options = {
      headers: {
        Authorization: this.sessionId,
      },
    };
    return axios
      .get(url, options)
      .then((response) => response.data)
      .catch((error) => {
        throw error;
      });
  }
}

class Location {
  constructor(json) {
    this.locationID = json.locationInfo.locationId;
    this.name = json.locationInfo.name;
    this.streetAddress = json.locationInfo.streetAddress;
    this.city = json.locationInfo.city;
    this.country = json.locationInfo.country;
    this.postcode = json.locationInfo.postcode;
    this.locationType = json.locationInfo.locationType;
    this.devices = json.gateways[0].temperatureControlSystems[0].zones.map(
      (device) => new Device(device)
    );
    this.daylightSavingTimeEnabled = json.locationInfo.useDaylightSaveSwitching;
    this.timeZone = new Timezone(json.locationInfo.timeZone);
    this.systemId = json.gateways[0].temperatureControlSystems[0].systemId;
  }
}

class Timezone {
  constructor(json) {
    this.timeZoneId = json.timeZoneId;
    this.displayName = json.displayName;
    this.offsetMinutes = json.offsetMinutes;
    this.currentOffsetMinutes = json.currentOffsetMinutes;
    this.supportsDaylightSaving = json.supportsDaylightSaving;
  }
}

class Device {
  constructor(json) {
    this.zoneID = json.zoneId;
    this.zoneType = json.zoneType;
    this.modelType = json.modelType;
    this.name = json.name;
    this.maxHeatSetpoint = json.setpointCapabilities.maxHeatSetpoint;
    this.minHeatSetpoint = json.setpointCapabilities.minHeatSetpoint;
    this.valueResolution = json.setpointCapabilities.valueResolution;
  }
}

class Thermostat {
  constructor(json) {
    this.zoneId = json.zoneId;
    this.name = json.name;
    this.temperatureStatus = new TemperatureStatus(json.temperatureStatus);
    this.setpointStatus = new SetpointStatus(json.setpointStatus);
  }
}

class TemperatureStatus {
  constructor(json) {
    this.temperature = json.temperature;
    this.isAvailable = json.isAvailable;
  }
}

class SetpointStatus {
  constructor(json) {
    this.targetHeatTemperature = json.targetHeatTemperature;
    this.setpointMode = json.setpointMode;
  }
}

class Schedule {
  constructor(json) {
    this.dayOfWeek = json.dayOfWeek;
    this.switchpoints = json.switchpoints.map((sw) => new Switchpoint(sw));
  }
}

class Switchpoint {
  constructor(json) {
    this.heatSetpoint = json.heatSetpoint;
    this.timeOfDay = json.timeOfDay;
  }
}

class SystemModeStatus {
  constructor(json) {
    this.mode = json.mode;
    this.isPermanent = json.isPermanent;
  }
}

function login(username, password) {
  const body =
    "grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=" +
    encodeURIComponent(username) +
    "&Password=" +
    encodeURIComponent(password);
  const options = {
    headers: {
      Authorization:
        "Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==",
      "Content-Type": "application/x-www-form-urlencoded",
      Connection: "Keep-Alive",
      "Cache-Control": "no-store no-cache",
      Pragma: "no-cache",
    },
  };
  return axios
    .post(oauthUrl, body, options)
    .then((response) => response.data)
    .catch((error) => {
      throw error;
    });
}

function getUserInfo(json) {
  const options = {
    headers: {
      Authorization: "bearer " + json.access_token,
    },
  };
  const url = apiUrl + "/userAccount";
  return axios
    .get(url, options)
    .then((response) => response.data)
    .catch((error) => {
      throw error;
    });
}

module.exports = {
  login: function (username, password) {
    return login(username, password).then(function (json) {
      return getUserInfo(json).then(function (userinfojson) {
        return new Session(username, password, json, userinfojson);
      });
    });
  },
};
