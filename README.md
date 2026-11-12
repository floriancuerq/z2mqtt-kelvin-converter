# Zigbee2MQTT Kelvin Converter

A Zigbee2MQTT external converter for the Schneider Electric **Kelvin**, a battery-powered Green Power (GP) thermostat controller.

Out of the box, Zigbee2MQTT (Z2M) pairs the Kelvin as a generic GP device and only exposes an `action` plus a raw byte `payload`. This converter decodes the frames into real values: **temperature, humidity, battery and voltage**.

Tested on Zigbee2MQTT 2.12.0. External converter syntax changes between major versions, so other versions may need tweaks.

## Requirements

- Zigbee2MQTT 2.x with a coordinator that supports Green Power. Tested with a ConBee II, which receives Green Power frames directly, so no proxy is needed while the Kelvin is in the stick's radio range. If it is out of range, or your coordinator can't receive Green Power frames itself (some Silicon Labs/EmberZNet sticks), put a router with the Green Power proxy role near the Kelvin (for example a Hue, IKEA or Innr bulb or plug).
- Access to the `data/external_converters/` folder in the Z2M data folder

## Install

1. Pair the Kelvin with Z2M. It shows up as a `GreenPower_48` device whose IEEE address is `0x00000000` followed by its 4-byte SourceID. Note that address in the Z2M frontend.
2. Copy [`kelvin.mjs`](kelvin.mjs) to `data/external_converters/` and replace `XXXXXXXX` in `KELVIN_IEEE` with your device's SourceID. If you leave the placeholder, the converter never matches and nothing reports an error.
3. Restart Z2M and check the startup log for errors loading the converter.
4. Wait about 10 minutes for the first periodic report.

`zigbee2mqtt/<device>` should then contain values like:

```json
{"temperature": 20.5, "humidity": 69, "battery": 82, "voltage": 4000}
```

Home Assistant picks these up through MQTT discovery.

## How it works

The converter keeps `genericGreenPower()` for action handling and adds one `fromZigbee` converter. Z2M has already parsed the frames (`commandFrame.reports` for `0xA2`, `commandFrame.attributes` for `0xA0`), so the converter only scales the values.

If a `0xA0` or `0xA2` frame has nothing it recognises, it publishes `gp_unparsed` with the raw `commandFrame` so you can inspect the layout.

## Device behaviour

These notes come from watching a real device. They are not from vendor documentation.

- It wakes up about every 10 minutes.
- Temperature and humidity arrive in GP command `0xA2`. Battery arrives right after, in `0xA0`. So the first publish of a wake-up can still carry the previous battery value.
- Pressing the button sends only `0xA6` (ZCL tunneling) requests, which Z2M shows as `action: zcl_tunneling`. They contain no measurements.
- Z2M publishes each frame twice, with identical values.

## Frames

Multi-byte fields are little-endian. Z2M strips the GP command ID from the byte array it shows in `payload`.

| Command | Name | Direction | Used for |
|---|---|---|---|
| `0xA0` | Attribute reporting | device → Z2M | battery voltage and percentage |
| `0xA2` | Multi-cluster reporting | device → Z2M | temperature and humidity |
| `0xA6` | ZCL tunneling | device → Z2M | reads and writes against the thermostat |
| `0xF6` | ZCL tunneling response | Z2M → device | reply to an `0xA6` read (not implemented) |

### Measurements (`0xA2`) and battery (`0xA0`)

| Command | Cluster | Attribute | Type | Meaning | Scale |
|---|---|---|---|---|---|
| `0xA2` | `0x0402` | `0x0000` | int16 | temperature | 0.01 °C, `0x8000` = invalid |
| `0xA2` | `0x0405` | `0x0000` | uint16 | relative humidity | 0.01 %, `0xFFFF` = no measurement |
| `0xA0` | `0x0001` | `0x0020` | uint8 | battery voltage | 100 mV, `0xFF` = invalid |
| `0xA0` | `0x0001` | `0x0021` | uint8 | battery percentage | 0.5 %, `0xFF` = invalid |

### ZCL tunneling request (`0xA6`)

Layout: option byte, cluster, ZCL command, length, then attribute IDs. Example payload as shown by Z2M:

```
[0, 1, 2, 0, 4, 18, 0, 41, 0]
```

| Bytes | Meaning |
|---|---|
| `00` | option: global command, no manufacturer ID |
| `01 02` | cluster `0x0201` (Thermostat) |
| `00` | ZCL command: read attributes |
| `04` | length of the attribute list |
| `12 00` | attribute `0x0012` (heating setpoint) |
| `29 00` | attribute `0x0029` (thermostat running state) |

This is a combined setpoint and heating-status read. The device sends it twice and then opens a short receive window for a reply.

The reply would be an `0xF6` frame with the same cluster and one record per attribute: attribute ID, status byte, type, value. The setpoint is an int16 in 0.01 °C. The running state is a 16-bit map: bit 0 means heating, bit 1 means cooling.

## Limitations

- Nothing answers the Kelvin's setpoint, boost and heating-status requests (`0xA6`). They presumably time out. Measurements are not affected.


## Licence

MIT, see [LICENSE](LICENSE).
