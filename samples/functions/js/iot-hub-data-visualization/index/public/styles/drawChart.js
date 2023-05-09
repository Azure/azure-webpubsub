// A class for holding the last N points of telemetry for a device
class DeviceData {
  constructor(deviceId) {
    this.deviceId = deviceId;
    this.maxLen = 50;
    this.timeData = new Array(this.maxLen);
    this.temperatureData = new Array(this.maxLen);
    this.humidityData = new Array(this.maxLen);
  }

  bind(chart) {
    this.chart = chart;
  }

  addData(time, temperature, humidity) {
    this.timeData.push(time);
    this.temperatureData.push(temperature);
    this.humidityData.push(humidity || null);

    if (this.timeData.length > this.maxLen) {
      this.timeData.shift();
      this.temperatureData.shift();
      this.humidityData.shift();
    }
  }
}

// All the devices in the list (those that have been sending telemetry)
class TrackedDevices {
  constructor() {
    this.maxLen = 50;
    this.timeData = new Array(this.maxLen);
    this.devices = [];
  }

  // Find a device based on its Id
  findDevice(deviceId) {
    for (let i = 0; i < this.devices.length; ++i) {
      if (this.devices[i].deviceId === deviceId) {
        return this.devices[i];
      }
    }

    return undefined;
  }

  getDevicesCount() {
    return this.devices.length;
  }

  addData(time, temperature, deviceId, dataSet, options) {
    let containsDeviceId = false;
    this.timeData.push(time);
    for (let i = 0; i < this.devices.length; ++i) {
      if (this.devices[i].deviceId === deviceId) {
        containsDeviceId = true;
        this.devices[i].temperatureData.push(temperature);
      } else this.devices[i].temperatureData.push(null);
    }

    if (!containsDeviceId) {
      const device = new DeviceData(deviceId);
      this.devices.push(device);
      const data = getRandomDataSet(deviceId, 0);
      data.data = device.temperatureData;
      device.temperatureData.push(temperature);
      dataSet.push(data);
    }

    if (this.timeData.length > this.maxLen) {
      this.timeData.shift();
      this.devices.forEach((s) => {
        s.temperatureData.shift();
      });
    }
  }
}

function getRandom(max) {
  return Math.floor(Math.random() * max + 1);
}

function getDataSet(id, axisId, r, g, b) {
  return {
    fill: false,
    label: id,
    yAxisID: axisId,
    borderColor: `rgba(${r}, ${g}, ${b}, 1)`,
    pointBoarderColor: `rgba(${r}, ${g}, ${b}, 1)`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.4)`,
    pointHoverBackgroundColor: `rgba(${r}, ${g}, ${b}, 1)`,
    pointHoverBorderColor: `rgba(${r}, ${g}, ${b}, 1)`,
    spanGaps: true,
  };
}

function getRandomDataSet(id, axisId) {
  return getDataSet(id, axisId, getRandom(255), getRandom(255), getRandom(255));
}

function getYAxy(id, display, position) {
  return {
    id: id,
    type: "linear",
    scaleLabel: {
      labelString: display || id,
      display: true,
    },
    position: position,
  };
}
