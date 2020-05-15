/* 
This will be updated! Be careful! Things to do:
[x] move away from lodash to native methods
    -> tested, working
[ ] move request methods to axios as request is now deprecated
    [ ] setHeatSetpoint
    [ ] _request
    [ ] _renew
    [ ] login
    [x] getUserInfo
        --> tested, works
[x] modernize constructor functions into modern classes
    -> tested, working
*/

var Q = require("q");
var request = require("request");
const axios = require("axios");

// Private
var sessionCredentials = {};

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
  getSchedule(zoneId) {
    var url = apiUrl + "/temperatureZone/" + zoneId + "/schedule";
    return this._request(url).then(function (json) {
      return json.dailySchedules.map((s) => new Schedule(s));
    });
  }
  getThermostats(locationId) {
    var url = apiUrl + "/location/" + locationId + "/status?includeTemperatureControlSystems=True";
    return this._request(url).then(function (json) {
      return json.gateways[0].temperatureControlSystems[0].zones.map((t) => new Thermostat(t));
    });
  }
  getSystemModeStatus(locationId) {
    var url = apiUrl + "/location/" + locationId + "/status?includeTemperatureControlSystems=True";
    return this._request(url).then(function (json) {
      return new SystemModeStatus(json.gateways[0].temperatureControlSystems[0].systemModeStatus);
    });
  }
  getLocations() {
    var url =
      apiUrl +
      "/location/installationInfo?userId=" +
      this.userInfo.userID +
      "&includeTemperatureControlSystems=True";
    return this._request(url).then(function (json) {
      return json.map((location) => {
        return new Location(location);
      });
    });
  }
  setHeatSetpoint(zoneId, targetTemperature, endTime) {
    var deferred = Q.defer();
    var url = apiUrl + "/temperatureZone/" + zoneId + "/heatSetpoint";
    var now = new Date();
    if (endTime != null) {
      if (endTime == "00:00:00") {
        now.setDate(now.getDate() + 1);
      }
      var endDateString = now.toDateString() + " " + endTime;
      var endDate = new Date(Date.parse(endDateString));
      var body = JSON.stringify({
        HeatSetpointValue: targetTemperature,
        SetpointMode: "TemporaryOverride",
        TimeUntil: endDate,
      });
    } else {
      // if target temperature is set to zero then we ask to follow the schedule instead of setting a temperature
      if (targetTemperature == 0) {
        var body = JSON.stringify({
          HeatSetpointValue: 0.0,
          SetpointMode: "FollowSchedule",
          TimeUntil: null,
        });
      } else {
        var body = JSON.stringify({
          HeatSetpointValue: targetTemperature,
          SetpointMode: "PermanentOverride",
          TimeUntil: null,
        });
      }
    }
    request(
      {
        method: "PUT",
        url: url,
        headers: {
          "Content-Type": "application/json",
          Authorization: this.sessionId,
        },
        body: body,
      },
      function (err, response) {
        if (err) {
          deferred.reject(err);
        } else {
          deferred.resolve(JSON.parse(response.body));
        }
      }
    );
    return deferred.promise;
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
        console.error(error.response);
        throw error;
      });
  }
  _renew() {
    var self = this;
    var deferred = Q.defer();
    request(
      {
        method: "POST",
        url: oauthUrl,
        headers: {
          Authorization:
            "Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==",
          "Content-Type": "application/x-www-form-urlencoded",
          Connection: "Keep-Alive",
          "Cache-Control": "no-store no-cache",
          Pragma: "no-cache",
        },
        body: "grant_type=refresh_token&refresh_token=" + self.refreshToken,
      },
      function (err, response) {
        if (err) {
          deferred.reject(err);
        } else {
          try {
            deferred.resolve(JSON.parse(response.body));
          } catch (e) {
            deferred.reject(e);
          }
        }
      }
    );
    return deferred.promise;
  }
  _request(url) {
    var deferred = Q.defer();
    request(
      {
        method: "GET",
        url: url,
        headers: {
          Authorization: this.sessionId,
        },
      },
      function (err, response) {
        if (err) {
          deferred.reject(err);
        } else {
          var json;
          try {
            json = JSON.parse(response.body);
          } catch (ex) {
            console.error(ex);
            console.error(response.body);
            console.error(response);
            deferred.reject(ex);
          }
          if (json) {
            deferred.resolve(json);
          }
        }
      }
    );
    return deferred.promise;
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
  var deferred = Q.defer();
  request(
    {
      method: "POST",
      url: oauthUrl,
      headers: {
        Authorization:
          "Basic NGEyMzEwODktZDJiNi00MWJkLWE1ZWItMTZhMGE0MjJiOTk5OjFhMTVjZGI4LTQyZGUtNDA3Yi1hZGQwLTA1OWY5MmM1MzBjYg==",
        "Content-Type": "application/x-www-form-urlencoded",
        Connection: "Keep-Alive",
        "Cache-Control": "no-store no-cache",
        Pragma: "no-cache",
      },
      body:
        "grant_type=password&scope=EMEA-V1-Basic EMEA-V1-Anonymous EMEA-V1-Get-Current-User-Account&Username=" +
        encodeURIComponent(username) +
        "&Password=" +
        encodeURIComponent(password),
    },
    function (err, response) {
      if (err) {
        deferred.reject(err);
      } else {
        var json;
        try {
          json = JSON.parse(response.body);

          if (json.error != null) {
            deferred.reject(json.error);
          } else if (json.access_token == null) {
            deferred.reject("No 'access_token' in " + JSON.stringify(json));
          } else {
            deferred.resolve(JSON.parse(response.body));
          }
        } catch (e) {
          deferred.reject(e);
        }
      }
    }
  );
  return deferred.promise;
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
      console.error(error.response);
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
