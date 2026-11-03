# Simplified Fingerprint Prototype — Mantra MFS100

Web component for the **Mantra MFS100** fingerprint reader. It scans a finger through the Mantra client on this computer and returns the captured **WSQ** image. **Matching / verifying is not done in this prototype** — you send that WSQ to your own API for verification.

These codes were created by **Switcherfaiz**.

## Requirements

1. Download the Mantra driver from [Mantra Downloads](https://mantratec.com/Download/User).
   On that page choose **Authentication devices**, then **Mantra100**, then **Drivers**. Install the Windows driver for the scanner.
2. Install and start the **MFS100 client service**. The browser talks to it at `http://127.0.0.1:8004/mfs100`. Capture will not work if that service is not running.
3. Plug the Mantra MFS100 reader into this computer.

## How to run (Live Server)

ES modules (`fingerprint-component.js`, `fingerprint-api.js`) will not load if you open the HTML file as `file://`. Serve it over HTTP. The page also calls `http://127.0.0.1:8004`, which a `file://` page cannot do.

**VS Code / Cursor — Live Server extension**

1. Clone or download this repository.
2. Install the **Live Server** extension.
3. Right-click `simplified-index.html` → **Open with Live Server**.
4. Connect the Mantra reader and confirm the MFS100 service is running.
5. Select a finger on the hands / circles, then click **Verify Fingerprint**.
6. Place your finger on the reader. The scan preview is shown in the floating popup. The WSQ payload is logged in the browser console.

**Alternative (any static server)**

```bash
npx --yes live-server --open=simplified-index.html
```

## What this prototype does

| This component does | This component does not |
| --- | --- |
| Ask the local Mantra service for the reader, then capture one finger | Compare two fingerprints or decide “match / no match” |
| Return a WSQ payload (`base64` / `base64Plain`) plus a BMP preview (`dataUrl`) | Call a remote identity / AFIS service |
| Optionally store a local enrollment in memory for demos | Replace your backend verification API |

The Mantra service returns several pictures in one capture. This client keeps **one** of them. The default is `WsqImage`.

| Format | What it is |
| --- | --- |
| `WsqImage` | WSQ compressed fingerprint. This is the default and the value sent for verification. |
| `BitmapData` | BMP preview of the same scan. The floating popup uses this so you can see the finger. |
| `IsoTemplate` | ISO/IEC 19794-2 finger template. |
| `AnsiTemplate` | ANSI/INCITS 378 finger template. |
| `IsoImage` | ISO fingerprint image. |
| `RawData` | Raw image buffer. |

Change the default in `fingerprint-api.js`:

```js
this.currentFormat = this.formats.WsqImage;
```

Typical flow:

1. Scan → `getTemplate()` / `verify()` returns `{ finger, template, imageData }`.
2. `imageData.base64Plain` is the WSQ. `imageData.dataUrl` is the BMP preview.
3. POST the WSQ to **your** verification API.
4. That API performs matching and returns the result.

## Project structure

- `simplified-index.html` — demo page that hosts `<fingerprint-component>`
- `fingerprint-component.js` — UI web component (finger picker, scan, floating preview)
- `fingerprint-api.js` — client for the local Mantra MFS100 service
- `images/` — UI icons

---

## `fingerprint-api.js` methods

Import the singleton. Both names are the same object.

```js
import { fingerprintAPI } from './fingerprint-api.js';
// or
import { fingerprintMantraAPI } from './fingerprint-api.js';
```

### Device and scanning

| Method | What it does |
| --- | --- |
| `initialize()` | No socket to open. Call it once so the setup matches other readers. |
| `setEventHandlers(handlers)` | Registers `onSamplesAcquired` and `onCommunicationFailed`. |
| `getReaders()` | Calls `GET/POST /mfs100/info`. Returns `[{ vendor, name, id, readerId }]` or `[]` if the service or scanner is down. |
| `selectReader(readerId)` | Stores the reader. Pass a serial string or the object from `getReaders()`. |
| `setCaptureContext({ finger })` | Stores the selected finger code (for example `"R2"`) on the next `getTemplate()`. |
| `startScanning()` | Posts `{ Quality, TimeOut }` to `/mfs100/capture`. The sample arrives later on `onSamplesAcquired`. |
| `stopScanning()` | Aborts the capture that is in progress. |
| `getFormatLabel()` | The field currently kept from the capture (`"WsqImage"` by default). |

`Quality` defaults to `60` (minimum accepted quality, 1–100). `TimeOut` defaults to `10` seconds. `100` is strict and captures often time out.

### Capture payload

| Method | What it does |
| --- | --- |
| `getImageData()` | `{ success, imageData }` for `currentFormat`. `imageData.base64Plain` is that field. `imageData.dataUrl` is a BMP preview when the service returned `BitmapData`. |
| `getTemplate()` | `{ success, finger, template, imageData, format }`. `template` is the same base64 as `imageData.base64Plain`. |
| `getVerificationImage()` | The WSQ string only (`WsqImage`), even if `currentFormat` is changed. |
| `verify()` | **Does not match fingerprints.** Returns `getTemplate()` so you can send the WSQ to an API. |
| `clear()` | Clears the last capture. |

### Status checks

| Method | What it does |
| --- | --- |
| `isReaderReady()` | `true` if a reader is selected and a capture is not running. |
| `isScanning()` | `true` while a capture request is in progress. |
| `hasFingerprintCaptured()` | `true` if the selected format is present on the last capture. |

---

## Code snippets

### 1. Find the reader and capture

```js
import { fingerprintAPI } from './fingerprint-api.js';

fingerprintAPI.initialize();

fingerprintAPI.setEventHandlers({
  onSamplesAcquired: (data) => {
    // data.imageData.base64Plain — WSQ, no data: prefix (send this)
    // data.imageData.dataUrl     — BMP preview (show in <img>)
    console.log('Captured', data.format, data.imageData);
  },
  onCommunicationFailed: (event) => {
    console.error(event?.message || 'Capture failed');
  }
});

const readers = await fingerprintAPI.getReaders();
if (!readers.length) throw new Error('No Mantra reader found. Start the MFS100 service and connect the scanner.');
fingerprintAPI.selectReader(readers[0]);

fingerprintAPI.setCaptureContext({ finger: 'R2' }); // right index
await fingerprintAPI.startScanning();
```

The capture call is:

```http
POST http://127.0.0.1:8004/mfs100/capture
Content-Type: application/json

{ "Quality": 60, "TimeOut": 10 }
```

Device info is `GET` or `POST` `http://127.0.0.1:8004/mfs100/info`.

### 2. Use the web component (as in `simplified-index.html`)

```html
<script type="module">
  import { FingerprintComponent } from './fingerprint-component.js';
</script>

<fingerprint-component></fingerprint-component>
```

Serve that page with Live Server. After a scan, the preview appears in the floating capture popup and the WSQ is in the console.

### 3. Send the WSQ to *your* verification API

`verify()` only returns the capture. Matching happens on the server you call.

```js
const result = fingerprintAPI.verify();

if (!result.success) {
  throw new Error(result.message || 'No fingerprint captured');
}

const body = {
  finger: result.finger,                      // e.g. "R2"
  imageBase64: result.imageData.base64Plain,  // WSQ, no data: prefix
  format: result.format,                      // "WsqImage"
  wsq: fingerprintAPI.getVerificationImage()
};

const response = await fetch('https://your-api.example/fingerprint/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const match = await response.json();
// match.verified / match.score — decided by your API, not this prototype
```

### 4. Show the captured preview yourself

```js
const { imageData } = fingerprintAPI.getImageData();
if (imageData?.dataUrl) {
  document.querySelector('#preview').src = imageData.dataUrl;
}
```

`dataUrl` is the BMP preview. The WSQ itself is `imageData.base64Plain`.

### 5. Choose another format

```js
fingerprintAPI.currentFormat = fingerprintAPI.formats.IsoTemplate;
const result = fingerprintAPI.getTemplate();
// result.template is now the ISO template from the last capture
// fingerprintAPI.getVerificationImage() is still the WSQ
```

## Author

These codes were written by **Switcherfaiz**.
