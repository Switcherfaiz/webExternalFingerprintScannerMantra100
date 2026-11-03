const plain = (value) => value ? String(value).replace(/\s/g, '') : null;

export class FingerprintMantraAPI {
  constructor() {
    this.baseUrl = 'http://127.0.0.1:8004/mfs100';
    this.quality = 60;
    this.timeout = 10;
    this.fingerprintData = null;
    this.imageData = null;
    this.selectedReader = null;
    this.acquisitionStarted = false;
    this.eventHandlers = {};
    this.captureContext = { finger: null };
    this.captureAbort = null;
    // "BitmapData"   - BMP preview image
    // "IsoTemplate"  - ISO finger template
    // "AnsiTemplate" - ANSI finger template
    // "IsoImage"     - ISO fingerprint image
    // "RawData"      - raw image
    // "WsqImage"     - WSQ image sent for verification
    this.formats = {
      BitmapData: 'BitmapData',
      IsoTemplate: 'IsoTemplate',
      AnsiTemplate: 'AnsiTemplate',
      IsoImage: 'IsoImage',
      RawData: 'RawData',
      WsqImage: 'WsqImage',
    };
    this.currentFormat = this.formats.WsqImage;
  }

  setCaptureContext(ctx) {
    this.captureContext = { ...this.captureContext, ...ctx };
  }

  getFormatLabel() {
    return this.currentFormat || 'unknown';
  }

  initialize() {
    return true;
  }

  setEventHandlers(handlers) {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  selectReader(readerId) {
    if (readerId && typeof readerId === 'object') {
      this.selectedReader = readerId.readerId || readerId.id || null;
      return;
    }
    this.selectedReader = readerId;
  }

  isReaderReady() {
    return !!this.selectedReader && !this.acquisitionStarted;
  }

  isScanning() {
    return this.acquisitionStarted;
  }

  clear() {
    this.fingerprintData = null;
    this.imageData = null;
  }

  readFormatValue(data = this.fingerprintData) {
    if (!data) return null;
    const key = this.currentFormat;
    const lower = key ? key.charAt(0).toLowerCase() + key.slice(1) : '';
    return plain(data[key] || data[lower]);
  }

  hasFingerprintCaptured() {
    return !!this.readFormatValue();
  }

  getImageData() {
    const value = this.readFormatValue();
    if (!value) {
      return { success: false, imageData: null, message: `No ${this.currentFormat} data in the capture` };
    }
    const preview = plain(this.fingerprintData?.BitmapData || this.fingerprintData?.bitmapData);
    this.imageData = {
      base64: value,
      base64Plain: value,
      base64url: value,
      dataUrl: this.currentFormat === this.formats.BitmapData
        ? `data:image/bmp;base64,${value}`
        : (preview ? `data:image/bmp;base64,${preview}` : ''),
      format: this.currentFormat,
      readerId: this.selectedReader,
    };
    return { success: true, imageData: this.imageData };
  }

  getTemplate() {
    const imageResult = this.getImageData();
    if (!imageResult.success) {
      return { success: false, message: imageResult.message || 'No fingerprint captured' };
    }
    return {
      success: true,
      finger: this.captureContext?.finger ?? null,
      template: imageResult.imageData.base64Plain,
      imageData: imageResult.imageData,
      format: this.currentFormat,
    };
  }

  getVerificationImage() {
    const data = this.fingerprintData;
    return plain(data?.WsqImage || data?.wsqImage || data?.WSQImage);
  }

  verify() {
    return this.getTemplate();
  }

  enroll(label = 'Finger') {
    const template = this.getTemplate();
    if (!template.success) return { success: false, message: template.message || 'No fingerprint captured' };
    return {
      success: true,
      message: 'Fingerprint enrolled successfully',
      enrollment: { label, template: template.template, reader: this.selectedReader },
    };
  }

  async startScanning() {
    if (this.acquisitionStarted) return true;
    this.acquisitionStarted = true;
    this.captureAbort = new AbortController();
    this.runCapture();
    return true;
  }

  async stopScanning() {
    if (this.captureAbort) this.captureAbort.abort();
    this.acquisitionStarted = false;
    this.captureAbort = null;
    return true;
  }

  async runCapture() {
    const abort = this.captureAbort;
    try {
      const data = await this.request('capture', {
        body: { Quality: this.quality, TimeOut: this.timeout },
        timeoutMs: (Number(this.timeout) + 8) * 1000,
        signal: abort?.signal,
      });
      const code = data?.ErrorCode ?? data?.errorCode;
      if (!(String(code) === '0' || data?.Status === true)) {
        this.eventHandlers.onCommunicationFailed?.({
          message: data?.ErrorDescription || data?.errorDescription || 'Capture failed',
          data,
        });
        return;
      }
      this.fingerprintData = data;
      this.imageData = null;
      const imageResult = this.getImageData();
      this.eventHandlers.onSamplesAcquired?.({
        imageData: imageResult.success ? imageResult.imageData : null,
        rawData: data,
        format: this.currentFormat,
        formatData: imageResult.success ? imageResult.imageData.base64Plain : null,
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      this.eventHandlers.onCommunicationFailed?.({ message: error.message || 'Capture failed' });
    } finally {
      if (this.captureAbort === abort) {
        this.acquisitionStarted = false;
        this.captureAbort = null;
      }
    }
  }

  async getReaders() {
    try {
      let info = null;
      try {
        info = await this.request('info', { httpMethod: 'GET', timeoutMs: 2500 });
      } catch (_) {}
      if (!this.deviceFrom(info)) {
        info = await this.request('info', { body: {}, timeoutMs: 2500 });
      }
      const device = this.deviceFrom(info);
      if (!device) return [];
      const serial = String(device.SerialNo || device.serialNo || device.SerialNumber || 'mfs100');
      const name = `${device.Make || device.make || 'Mantra'} ${device.Model || device.model || 'MFS100'}`.replace(/\s+/g, ' ').trim();
      return [{ vendor: 'mantra', name, id: serial, readerId: serial }];
    } catch (error) {
      console.error('Error getting Mantra reader:', error);
      return [];
    }
  }

  deviceFrom(info) {
    if (!info || typeof info !== 'object') return null;
    const code = info.ErrorCode ?? info.errorCode;
    if (code != null && String(code) !== '0') return null;
    const device = info.DeviceInfo || info.deviceInfo || info;
    const named = device.SerialNo || device.serialNo || device.SerialNumber || device.Make || device.make || device.Model || device.model;
    return named ? device : null;
  }

  async request(method, { httpMethod = 'POST', body, timeoutMs = 4000, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const response = await fetch(`${String(this.baseUrl).replace(/\/$/, '')}/${method}`, {
        method: httpMethod,
        signal: controller.signal,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      const nested = data?.data;
      if (nested && typeof nested === 'object' && !Array.isArray(nested) && (nested.ErrorCode != null || nested.BitmapData || nested.IsoTemplate || nested.WsqImage)) {
        return nested;
      }
      return data;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
}

export const fingerprintMantraAPI = new FingerprintMantraAPI();
export const fingerprintAPI = fingerprintMantraAPI;
