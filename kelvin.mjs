// Zigbee2MQTT external converter: Schneider "Kelvin" (Green Power) thermostat controller
// Reports temperature, humidity, battery and voltage.
//
// Install: copy to <z2m data>/external_converters/kelvin.mjs, set your device's IEEE below,
// restart Zigbee2MQTT. Tested on Zigbee2MQTT 2.12 (ESM external converters).

import {genericGreenPower} from 'zigbee-herdsman-converters/lib/modernExtend';
import * as exposes from 'zigbee-herdsman-converters/lib/exposes';

const e = exposes.presets;

// Green Power devices get the IEEE 0x00000000 + 4-byte SourceID. Put yours here.
const KELVIN_IEEE = '^0x00000000XXXXXXXX$';

const fzKelvin = {
    cluster: 'greenPower',
    type: ['commandNotification'],
    convert: (model, msg, publish, options, meta) => {
        const id = msg.data.commandID;
        // 0xA2 = multi-cluster reporting (temperature, humidity), 0xA0 = attribute reporting (battery).
        // 0xA6 (ZCL tunneling requests from the Kelvin) is left to genericGreenPower().
        if (id !== 0xa0 && id !== 0xa2) return;

        const cf = msg.data.commandFrame;
        const out = {};

        // herdsman has already parsed 0xA2 into cf.reports
        if (cf && Array.isArray(cf.reports)) {
            for (const r of cf.reports) {
                if (r.clusterID === 0x0402 && r.attrData !== -32768) {
                    out.temperature = r.attrData / 100; // 0.01 degC
                } else if (r.clusterID === 0x0405 && r.attrData !== 0xffff) {
                    out.humidity = r.attrData / 100; // 0.01 %, 0xFFFF = no measurement
                }
            }
        }

        // ... and 0xA0 into cf.attributes
        if (cf && cf.attributes) {
            const v = cf.attributes.batteryVoltage;
            const p = cf.attributes.batteryPercentageRemaining;
            if (v != null && v !== 0xff) out.voltage = v * 100; // 100 mV units -> mV
            if (p != null && p !== 0xff) out.battery = p / 2; // 0.5 % units -> %
        }

        if (Object.keys(out).length === 0) {
            // Nothing recognised: expose the frame so its layout can be inspected.
            return {gp_unparsed: `cmd 0x${id.toString(16)}: ${JSON.stringify(cf)}`};
        }
        return out;
    },
};

export default {
    fingerprint: [{modelID: 'GreenPower_48', ieeeAddr: new RegExp(KELVIN_IEEE)}],
    model: 'Kelvin',
    vendor: 'Schneider Electric',
    description: 'Kelvin Green Power thermostat controller',
    extend: [genericGreenPower()],
    fromZigbee: [fzKelvin],
    exposes: [e.temperature(), e.humidity(), e.battery(), e.voltage()],
};
