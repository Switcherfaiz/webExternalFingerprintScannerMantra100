import { fingerprintAPI } from './fingerprint-api.js';

export class FingerprintComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.type = "verify"; // "enrollment" or "verify"
    this.isScanning = false;
    this.progress = 0;
    this.fingers = ["R1", "R2", "R3", "R4", "R5", "L1", "L2", "L3", "L4", "L5"];
    this.selectedFinger = null;
    this.progressTargetEl = null;
    this.fingerNames = {
      R1: 'Thumb', R2: 'Index', R3: 'Middle', R4: 'Ring', R5: 'Pinky',
      L1: 'Pinky', L2: 'Ring', L3: 'Middle', L4: 'Index', L5: 'Thumb'
    };
    this.icons = {
      fingerprint: 'images/fingerprint-icon.svg',
      verified: 'images/verified.svg',
      incorrect: 'images/incorrect.svg'
    };
  }

  twAlert(message, type, time) {
    const alert_elem = document.querySelector('tw-bottom-alert') || '';
    if (alert_elem) {
      alert_elem.setAttribute('message', message || '');
      alert_elem.setAttribute('type', type || '');
      alert_elem.setAttribute('time', time || '');
      alert_elem.setAttribute('active', 'true');
    }
  }

  async toggleScanning() {
    if (!this.isScanning) {
      if (!this.selectedFinger) {
        this.twAlert('Please select a finger (e.g., R1) first', 'error', 3500);
        return;
      }
      try {
        await fingerprintAPI.startScanning();
        this.isScanning = true;
        const targetEl = this.shadowRoot.querySelector(`.finger-item[data-finger="${this.selectedFinger}"] .fingerprint-container`);
        this.updateUI();
        this.startProgress(targetEl);
        this.twAlert('Place your finger on the scanner', 'info', 3000);
      } catch (error) {
        this.twAlert('Failed to start scanner: ' + error.message, 'error', 3500);
      }
    } else {
      try {
        await fingerprintAPI.stopScanning();
        this.isScanning = false;
        this.updateUI();
        this.stopProgress();
        this.twAlert('Scanning stopped', 'info', 3000);
      } catch (error) {
        this.twAlert('Error stopping scanner: ' + error.message, 'error', 3500);
      }
    }
  }

  startProgress(targetEl) {
    this.progress = 0;
    this.progressTargetEl = targetEl || null;
    if (this.progressInterval) clearInterval(this.progressInterval);
    this.progressInterval = setInterval(() => {
      this.progress = Math.min(100, this.progress + 2);
      this.updateProgressCircle();
      if (this.progress === 100) clearInterval(this.progressInterval);
    }, 50);
  }

  stopProgress() {
    clearInterval(this.progressInterval);
    this.progress = 0;
    this.updateProgressCircle();
    this.progressTargetEl = null;
  }

  updateProgressCircle() {
    if (!this.progressTargetEl) return;
    const circle = this.progressTargetEl.querySelector('.progress-circle');
    if (!circle) return;
    const circumference = 2 * Math.PI * 38;
    const offset = circumference - (this.progress / 100) * circumference;
    circle.style.strokeDashoffset = offset;
  }

  updateUI() {
    // Update finger items
    this.shadowRoot.querySelectorAll('.finger-item').forEach(el => {
      el.classList.remove('scanning', 'selected');
    });

    // Update SVG finger paths
    this.shadowRoot.querySelectorAll('.finger-path').forEach(path => {
      path.classList.remove('selected');
    });

    if (this.selectedFinger) {
      const selectedEl = this.shadowRoot.querySelector(`.finger-item[data-finger="${this.selectedFinger}"]`);
      if (selectedEl) {
        selectedEl.classList.add('selected');
        if (this.isScanning) selectedEl.classList.add('scanning');
      }
      const selectedPath = this.shadowRoot.querySelector(`.finger-path[data-finger="${this.selectedFinger}"]`);
      if (selectedPath) {
        selectedPath.classList.add('selected');
      }
    }

    const actionButton = this.shadowRoot.querySelector('.action-button');
    const messageText = this.shadowRoot.querySelector('.message-text');

    if (this.isScanning) {
      actionButton.textContent = "Cancel";
      messageText.textContent = "One moment...";
      actionButton.disabled = false;
    } else {
      actionButton.textContent = this.type === "enrollment" ? "Enroll Fingerprint" : "Verify Fingerprint";
      messageText.textContent = this.selectedFinger
        ? `Selected: ${this.selectedFinger} (${this.fingerNames[this.selectedFinger]})`
        : "Place and hold your finger on the fingerprint reader";
      actionButton.disabled = !this.selectedFinger;
    }
  }

  selectFinger(fingerKey) {
    this.selectedFinger = fingerKey;
    fingerprintAPI.setCaptureContext({ finger: fingerKey });
    this.updateUI();
  }

  async handleEnroll() {
    if (!fingerprintAPI.hasFingerprintCaptured()) {
      this.twAlert('Please scan your fingerprint first', 'error', 3500);
      return;
    }
    const result = fingerprintAPI.enroll("Fingerprint");
    const template = fingerprintAPI.getTemplate();
    const imageSrc = this.getCapturedImageSrc(template);
    if (imageSrc) {
      this.displayCapturedImage(imageSrc);
    }
    if (result.success) {
      this.showSuccess();
      this.twAlert('Fingerprint enrolled successfully', 'success', 3000);
    } else {
      this.showError();
      this.twAlert(result.message, 'error', 3500);
    }
  }

  getCapturedImageSrc(result) {
    return result?.imageData?.dataUrl
      || result?.imageData?.dataURL
      || result?.image
      || null;
  }

  displayCapturedImage(imageSrc) {
    if (!imageSrc) return;
    this.showFingerprintImageViewer(imageSrc);
  }

  async handleVerify() {
    if (!fingerprintAPI.hasFingerprintCaptured()) {
      this.twAlert('Please scan your fingerprint first', 'error', 3500);
      return;
    }
    const result = fingerprintAPI.verify();

    // Log the fingerprint data and selected finger
    console.log('Fingerprint data:', {
      finger: this.selectedFinger,
      fingerName: this.fingerNames[this.selectedFinger],
      ...result
    });

    const imageSrc = this.getCapturedImageSrc(result);
    if (imageSrc) {
      this.displayCapturedImage(imageSrc);
    }

    if (result.success) {
      this.showSuccess();
      this.twAlert('Fingerprint captured successfully', 'success', 3000);
    } else {
      this.showError();
      this.twAlert('Capture failed', 'error', 3500);
    }
  }

  showSuccess() {
    const container = this.shadowRoot.querySelector(`.finger-item[data-finger="${this.selectedFinger}"] .fingerprint-container`);
    if (!container) return;
    const icon = container.querySelector('.fingerprint-icon');
    if (!icon) return;
    icon.classList.add('success');
    icon.innerHTML = `<img src="${this.icons.verified}" alt="Verified" width="32" height="32">`;
    setTimeout(() => {
      icon.classList.remove('success');
      icon.innerHTML = `<img src="${this.icons.fingerprint}" alt="Fingerprint" width="40" height="40">`;
    }, 2000);
  }

  showError() {
    const container = this.shadowRoot.querySelector(`.finger-item[data-finger="${this.selectedFinger}"] .fingerprint-container`);
    if (!container) return;
    const icon = container.querySelector('.fingerprint-icon');
    if (!icon) return;
    icon.classList.add('error');
    icon.innerHTML = `<img src="${this.icons.incorrect}" alt="Incorrect" width="32" height="32">`;
    setTimeout(() => {
      icon.classList.remove('error');
      icon.innerHTML = `<img src="${this.icons.fingerprint}" alt="Fingerprint" width="40" height="40">`;
    }, 2000);
  }

  showFingerprintImageViewer(imageData) {
    // Remove existing viewer if any
    const existing = this.shadowRoot.querySelector('.fp-image-viewer');
    if (existing) existing.remove();

    const viewer = document.createElement('div');
    viewer.className = 'fp-image-viewer';
    viewer.innerHTML = `
      <div class="fp-image-viewer-inner">
        <div class="fp-image-viewer-header">
          <span class="fp-image-viewer-label">Fingerprint Capture</span>
          <button class="fp-image-viewer-close" aria-label="Close">✕</button>
        </div>
        <div class="fp-image-viewer-body">
          <img
            src="${imageData}"
            alt="Captured fingerprint"
            class="fp-image-viewer-img"
          />
          <div class="fp-image-viewer-meta">
            <span class="fp-image-viewer-finger">${this.selectedFinger} — ${this.fingerNames[this.selectedFinger]}</span>
          </div>
        </div>
      </div>
    `;

    viewer.querySelector('.fp-image-viewer-close').addEventListener('click', () => {
      viewer.classList.remove('visible');
      setTimeout(() => viewer.remove(), 300);
    });

    this.shadowRoot.appendChild(viewer);
    requestAnimationFrame(() => viewer.classList.add('visible'));
  }

  async initializeFingerprint() {
    fingerprintAPI.initialize();

    fingerprintAPI.setEventHandlers({
      onDeviceConnected: () => this.twAlert('Device connected', 'success', 3000),
      onDeviceDisconnected: () => {
        this.isScanning = false;
        this.updateUI();
        this.stopProgress();
        this.twAlert('Device disconnected', 'error', 3500);
      },
      onCommunicationFailed: () => {
        this.isScanning = false;
        this.updateUI();
        this.stopProgress();
        this.twAlert('Communication failed', 'error', 3500);
      },
      onSamplesAcquired: (data) => {
        this.twAlert('Fingerprint captured', 'success', 3000);
        this.isScanning = false;
        this.updateUI();
        this.stopProgress();

        const imageSrc = data?.imageData?.dataUrl || data?.imageData?.dataURL;
        if (imageSrc) {
          this.displayCapturedImage(imageSrc);
        }

        if (this.type === "verify") {
          this.handleVerify();
        } else {
          this.handleEnroll();
        }
      }
    });

    const readers = await fingerprintAPI.getReaders();
    if (readers?.length > 0) {
      fingerprintAPI.selectReader(readers[0]);
    } else {
      this.twAlert('No fingerprint readers found', 'error', 3500);
    }
  }

  render() {
    const isDark = this.hasAttribute('dark');

    // Right hand SVG with provided paths
    const rightHandSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430.91 463.16" class="hand-svg right-hand" aria-label="Right hand">
        <style>.cls-1{fill:#ccc;}.selected{fill:var(--brand);}</style>
        <g>
          <path class="cls-1" d="M428.82,163.39c-.16,2.36-1.39,4.7-2.4,6.92-14.25,31.61-25.66,64.08-35.42,97.05-10.9,36.79-19.75,74.2-28.24,111.75-5.71,25.27-16.78,47.81-39,63.44C272,479,172,465.17,132,416.63c-6.17-7.5-12.1-15.21-17.9-23C81.41,349.54,52.68,302,6.5,269.41c-4.89-3.45-7.86-8.7-5.87-15,2.48-7.86,8.51-11.71,16.46-12.72,19.88-2.49,37,4.44,53,15.48,17.13,11.83,28.77,29.13,43.78,43,9,8.31,15.86,11.85,22.1,10.44,5.68-1.28,10.85-6.64,16.62-16.19,15.8-26.14,16-54.29,14.18-82.89-.31-5-.68-10.1-1-15.16-3.67-52.21-10.43-104.22-9-156.78.32-11.27,4.13-17.24,13.93-19.57s17.79,1.11,23.24,9.77c5.81,9.21,8.14,19.43,9.4,30.18,4.4,37.45,8.95,74.87,14.09,112.22,1.22,9,1.09,19,9.92,29.71l4.21-1.25c-.05-9.95-.21-16.62.05-23.27,2-49.16,3.94-98.32,6.32-147.46.77-16,6-30.55,25.2-29.89S286.37,14.88,286,31.35c-.68,33.6-1.17,67.2-1.74,100.79q.07,15.53.14,31c2.89,6.52-.65,14.29,2,21.22l4.1,4.11c6.76-5.58,7.59-13.76,8.6-21.18,4.81-35.92,16.81-70,26.11-104.79,3.91-14.61,9.45-29.74,29.6-24.65C374.25,42.77,370.79,58.53,368,72c-8.33,40.1-18.39,79.84-26.07,120-2.88,15.09-11.17,31.16-1,47,9.11-3,10.87-10.74,14.26-17.09,12.75-23.84,25.52-47.62,35.48-72.85,4.89-12.38,12.07-25.93,28.62-20.07C436.55,135.1,429.73,150.76,428.82,163.39Z"/>
          <path data-finger="R1" class="finger-path cls-1" id="Thumb_R1" d="M136,310.6l-21.81,83C81.41,349.54,52.68,302,6.5,269.41c-4.89-3.45-7.86-8.7-5.87-15,2.48-7.86,8.51-11.71,16.46-12.72,19.88-2.49,37,4.44,53,15.48,17.13,11.83,28.77,29.13,43.78,43C122.84,308.47,129.71,312,136,310.6Z"/>
          <path data-finger="R2" class="finger-path cls-1" id="Index_R2" d="M227.32,201.89l-60.57,9.63c-.31-5-.68-10.1-1-15.16-3.67-52.21-10.43-104.22-9-156.78.32-11.27,4.13-17.24,13.93-19.57s17.79,1.11,23.24,9.77c5.81,9.21,8.14,19.43,9.4,30.18,4.4,37.45,8.95,74.87,14.09,112.22C218.62,181.15,218.49,191.15,227.32,201.89Z"/>
          <path data-finger="R3" class="finger-path cls-1" id="Middle_R3" d="M286.45,184.4l-54.92,16.24c-.05-9.95-.21-16.62.05-23.27,2-49.16,3.94-98.32,6.32-147.46.77-16,6-30.55,25.2-29.89S286.37,14.88,286,31.35c-.68,33.6-1.17,67.2-1.74,100.79q.07,15.53.14,31C287.32,169.7,283.78,177.47,286.45,184.4Z"/>
          <path data-finger="R4" class="finger-path cls-1" id="Ring_R4" d="M368,72c-8.33,40.1-18.39,79.84-26.07,120-2.88,15.09-11.17,31.16-1,47l-50.39-50.51c6.76-5.58,7.59-13.76,8.6-21.18,4.81-35.92,16.81-70,26.11-104.79,3.91-14.61,9.45-29.74,29.6-24.65C374.25,42.77,370.79,58.53,368,72Z"/>
          <path data-finger="R5" class="finger-path cls-1" id="Pinky_R5" d="M428.82,163.39c-.16,2.36-1.39,4.7-2.4,6.92-14.25,31.61-25.66,64.08-35.42,97.05L340.94,239c9.11-3,10.87-10.74,14.26-17.09,12.75-23.84,25.52-47.62,35.48-72.85,4.89-12.38,12.07-25.93,28.62-20.07C436.55,135.1,429.73,150.76,428.82,163.39Z"/>
        </g>
      </svg>
    `;

    // Left hand SVG (mirrored with adjusted finger mappings)
    const leftHandSVG = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430.91 463.16" class="hand-svg left-hand" aria-label="Left hand" style="transform: scaleX(-1);">
        <style>.cls-1{fill:#ccc;}.selected{fill:var(--brand);}</style>
        <g>
          <path class="cls-1" d="M428.82,163.39c-.16,2.36-1.39,4.7-2.4,6.92-14.25,31.61-25.66,64.08-35.42,97.05-10.9,36.79-19.75,74.2-28.24,111.75-5.71,25.27-16.78,47.81-39,63.44C272,479,172,465.17,132,416.63c-6.17-7.5-12.1-15.21-17.9-23C81.41,349.54,52.68,302,6.5,269.41c-4.89-3.45-7.86-8.7-5.87-15,2.48-7.86,8.51-11.71,16.46-12.72,19.88-2.49,37,4.44,53,15.48,17.13,11.83,28.77,29.13,43.78,43,9,8.31,15.86,11.85,22.1,10.44,5.68-1.28,10.85-6.64,16.62-16.19,15.8-26.14,16-54.29,14.18-82.89-.31-5-.68-10.1-1-15.16-3.67-52.21-10.43-104.22-9-156.78.32-11.27,4.13-17.24,13.93-19.57s17.79,1.11,23.24,9.77c5.81,9.21,8.14,19.43,9.4,30.18,4.4,37.45,8.95,74.87,14.09,112.22,1.22,9,1.09,19,9.92,29.71l4.21-1.25c-.05-9.95-.21-16.62.05-23.27,2-49.16,3.94-98.32,6.32-147.46.77-16,6-30.55,25.2-29.89S286.37,14.88,286,31.35c-.68,33.6-1.17,67.2-1.74,100.79q.07,15.53.14,31c2.89,6.52-.65,14.29,2,21.22l4.1,4.11c6.76-5.58,7.59-13.76,8.6-21.18,4.81-35.92,16.81-70,26.11-104.79,3.91-14.61,9.45-29.74,29.6-24.65C374.25,42.77,370.79,58.53,368,72c-8.33,40.1-18.39,79.84-26.07,120-2.88,15.09-11.17,31.16-1,47,9.11-3,10.87-10.74,14.26-17.09,12.75-23.84,25.52-47.62,35.48-72.85,4.89-12.38,12.07-25.93,28.62-20.07C436.55,135.1,429.73,150.76,428.82,163.39Z"/>
          <path data-finger="L1" class="finger-path cls-1" id="Pinky_L1" d="M428.82,163.39c-.16,2.36-1.39,4.7-2.4,6.92-14.25,31.61-25.66,64.08-35.42,97.05L340.94,239c9.11-3,10.87-10.74,14.26-17.09,12.75-23.84,25.52-47.62,35.48-72.85,4.89-12.38,12.07-25.93,28.62-20.07C436.55,135.1,429.73,150.76,428.82,163.39Z"/>
          <path data-finger="L2" class="finger-path cls-1" id="Ring_L2" d="M368,72c-8.33,40.1-18.39,79.84-26.07,120-2.88,15.09-11.17,31.16-1,47l-50.39-50.51c6.76-5.58,7.59-13.76,8.6-21.18,4.81-35.92,16.81-70,26.11-104.79,3.91-14.61,9.45-29.74,29.6-24.65C374.25,42.77,370.79,58.53,368,72Z"/>
          <path data-finger="L3" class="finger-path cls-1" id="Middle_L3" d="M286.45,184.4l-54.92,16.24c-.05-9.95-.21-16.62.05-23.27,2-49.16,3.94-98.32,6.32-147.46.77-16,6-30.55,25.2-29.89S286.37,14.88,286,31.35c-.68,33.6-1.17,67.2-1.74,100.79q.07,15.53.14,31C287.32,169.7,283.78,177.47,286.45,184.4Z"/>
          <path data-finger="L4" class="finger-path cls-1" id="Index_L4" d="M227.32,201.89l-60.57,9.63c-.31-5-.68-10.1-1-15.16-3.67-52.21-10.43-104.22-9-156.78.32-11.27,4.13-17.24,13.93-19.57s17.79,1.11,23.24,9.77c5.81,9.21,8.14,19.43,9.4,30.18,4.4,37.45,8.95,74.87,14.09,112.22C218.62,181.15,218.49,191.15,227.32,201.89Z"/>
          <path data-finger="L5" class="finger-path cls-1" id="Thumb_L5" d="M136,310.6l-21.81,83C81.41,349.54,52.68,302,6.5,269.41c-4.89-3.45-7.86-8.7-5.87-15,2.48-7.86,8.51-11.71,16.46-12.72,19.88-2.49,37,4.44,53,15.48,17.13,11.83,28.77,29.13,43.78,43C122.84,308.47,129.71,312,136,310.6Z"/>
        </g>
      </svg>
    `;

    const leftFingers = ["L1", "L2", "L3", "L4", "L5"];
    const rightFingers = ["R1", "R2", "R3", "R4", "R5"];

    this.shadowRoot.innerHTML = `
      ${this.styleSheet()}
      <div class="group_top">
        <div class="user_detail"></div>
        <div class="close"><span class="switch_icon_close"></span></div>
      </div>
      <div class="container ${isDark ? 'dark' : ''}">
        <h2 class="title">Touch ID</h2>
        <p class="subtitle">Place and hold your finger on the fingerprint reader</p>
        <div class="hands-container">
          <div class="hand-wrapper left" role="group" aria-label="Left Hand">${leftHandSVG}</div>
          <div class="hand-wrapper right" role="group" aria-label="Right Hand">${rightHandSVG}</div>
        </div>
        <div class="fingers-rows">
          <div class="fingers-row" data-hand="left">
            ${leftFingers.map(finger => `
              <div class="finger-item" data-finger="${finger}">
                <div class="fingerprint-container">
                  <svg class="progress-ring" width="120" height="120">
                    <circle class="progress-ring-circle" stroke-width="4" fill="transparent" r="38" cx="60" cy="60"/>
                    <circle class="progress-circle" stroke-width="4" fill="transparent" r="38" cx="60" cy="60"
                      stroke-dasharray="${2 * Math.PI * 38}" stroke-dashoffset="${2 * Math.PI * 38}"/>
                  </svg>
                  <div class="fingerprint-icon">
                    <img src="${this.icons.fingerprint}" alt="${finger} ${this.fingerNames[finger]}" width="40" height="40">
                  </div>
                </div>
                <div class="finger-name">${this.fingerNames[finger]}</div>
              </div>`).join('')}
          </div>
          <div class="fingers-row" data-hand="right">
            ${rightFingers.map(finger => `
              <div class="finger-item" data-finger="${finger}">
                <div class="fingerprint-container">
                  <svg class="progress-ring" width="120" height="120">
                    <circle class="progress-ring-circle" stroke-width="4" fill="transparent" r="38" cx="60" cy="60"/>
                    <circle class="progress-circle" stroke-width="4" fill="transparent" r="38" cx="60" cy="60"
                      stroke-dasharray="${2 * Math.PI * 38}" stroke-dashoffset="${2 * Math.PI * 38}"/>
                  </svg>
                  <div class="fingerprint-icon">
                    <img src="${this.icons.fingerprint}" alt="${finger} ${this.fingerNames[finger]}" width="40" height="40">
                  </div>
                </div>
                <div class="finger-name">${this.fingerNames[finger]}</div>
              </div>`).join('')}
          </div>
        </div>
        <p class="message-text">Use the Mantra MFS100 fingerprint reader</p>
        <button class="action-button">${this.type === "enrollment" ? "Enroll Fingerprint" : "Verify Fingerprint"}</button>
      </div>
    `;

    // Add click listeners to fingerprint UI circles
    this.shadowRoot.querySelectorAll('.finger-item').forEach(el => {
      el.addEventListener('click', () => {
        const fingerKey = el.getAttribute('data-finger');
        this.selectFinger(fingerKey);
      });
    });

    // Add click listeners to SVG finger paths
    this.shadowRoot.querySelectorAll('.finger-path').forEach(path => {
      path.style.cursor = 'pointer';
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        const fingerKey = path.getAttribute('data-finger');
        if (fingerKey) {
          this.selectFinger(fingerKey);
        }
      });
    });

    // Action button
    this.shadowRoot.querySelector('.action-button').addEventListener('click', () => this.toggleScanning());
  }

  connectedCallback() {
    this.render();
    setTimeout(() => this.classList.add('active'), 50);
    this.initializeFingerprint();
    this.popFunctionality();
  }

  popFunctionality() {
    const closeBtn = this.shadowRoot.querySelector('.close');
    const pop = document.querySelector('.popup');
    if (closeBtn && pop) {
      if (!closeBtn.dataset.listenerAttached) {
        closeBtn.addEventListener('click', () => {
          pop.classList.remove('active');
          pop.innerHTML = '';
        });
        closeBtn.dataset.listenerAttached = 'true';
      }
    }
  }

  styleSheet() {
    return `
      <style>
        @import url('/assets/icons/style.css');
        @import url('/assets/styles/constant-css.css');
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        :host {
          display: block;
          width: 100%;
          margin: 0 auto;
        }
        :root, :host {
          --surface: #ffffff;
          --surface-2: #f7f7f7;
          --text: #222;
          --muted: #666;
          --muted-2: #999;
          --brand: #00c853;
          --danger: #ff3d00;
          --ring-track: #e0e0e0;
          --dark-surface: #1c1c1e;
          --dark-surface-2: #2c2c2e;
          --dark-text: #fff;
          --dark-muted: #999;
          --space-1: 8px;
          --space-2: 12px;
          --space-3: 16px;
          --space-4: 24px;
          --radius-1: 12px;
          --radius-2: 20px;
        }
        .group_top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .group_top .close {
          width: 35px;
          height: 35px;
          border-radius: 5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .group_top .close span {
          color: var(--brand);
          font-size: small;
        }
        .container {
          background: var(--surface);
          padding: 2rem;
          border-radius: var(--radius-2);
          text-align: center;
          transition: all 0.3s ease;
        }
        .container.dark {
          background: var(--dark-surface);
          color: var(--dark-text);
        }
        .title {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .subtitle {
          font-size: 14px;
          color: var(--muted);
          margin-bottom: var(--space-4);
        }
        .dark .subtitle { color: var(--dark-muted); }
        .finger-item {
          position: relative;
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
          padding: 4px 0;
          width: 120px;
          cursor: pointer;
          user-select: none;
        }
        .finger-item.selected .finger-label,
        .finger-item.selected .finger-name {
          color: var(--brand);
          font-weight: 700;
        }
        .fingerprint-container {
          position: relative;
          width: 120px;
          height: 120px;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          background: #f5f5f5;
          border-radius: 50%;
          box-shadow: 0 0 4px rgba(0,0,0,0.1);
          transition: background-color 0.3s;
        }
        .fingerprint-container.scanning {
          animation: pulse 2s infinite;
          background-color: var(--brand);
        }
        .progress-ring {
          position: absolute;
          top: 0; left: 0;
          transform: rotate(-90deg);
          z-index: 0;
        }
        .progress-ring-circle {
          stroke: var(--ring-track);
          stroke-width: 4;
          fill: transparent;
        }
        .progress-circle {
          stroke: var(--brand);
          stroke-width: 4;
          fill: transparent;
          transition: stroke-dashoffset 0.2s linear;
        }
        .fingerprint-icon {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
        }
        .fingerprint-icon img {
          max-width: 100%;
          max-height: 100%;
          filter: brightness(0.6);
          transition: filter 0.3s ease;
        }
        .finger-item.scanning .fingerprint-icon img {
          filter: brightness(1) hue-rotate(85deg);
        }
        .fingerprint-icon.success {
          background: var(--brand);
          border-radius: 50%;
        }
        .fingerprint-icon.success img {
          filter: brightness(0) invert(1);
        }
        .fingerprint-icon.error {
          background: var(--danger);
          border-radius: 50%;
        }
        .fingerprint-icon.error img {
          filter: brightness(0) invert(1);
        }
        .finger-name {
          font-size: 12px;
          color: var(--muted);
        }
        .dark .finger-name { color: var(--dark-muted); }
        .message-text {
          font-size: 14px;
          color: var(--muted);
          margin: 16px 0 24px;
        }
        .dark .message-text { color: var(--dark-muted); }
        .action-button {
          background: var(--brand);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 24px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          max-width: 300px;
          user-select: none;
        }
        .action-button:hover:not(:disabled) {
          background: #00b34a;
        }
        .action-button:disabled {
          background: var(--ring-track);
          cursor: not-allowed;
        }
        .hand-svg {
          width: 200px;
          height: auto;
          user-select: none;
        }
        .finger-path {
          cursor: pointer;
          transition: fill 0.3s;
        }
        .finger-path:hover { fill: var(--brand); }
        .finger-path.selected { fill: var(--brand); }
        .hands-container {
          display: flex;
          gap: 40px;
          justify-content: center;
          margin-bottom: 24px;
        }
        .fingers-rows {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }
        .fingers-row {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
          justify-content: center;
        }
        @keyframes pulse {
          0%   { transform: scale(1);   opacity: 1;   }
          50%  { transform: scale(1.1); opacity: 0.8; }
          100% { transform: scale(1);   opacity: 1;   }
        }

        /* ── Fingerprint image viewer ── */
        .fp-image-viewer {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          opacity: 0;
          transform: translateY(12px) scale(0.96);
          transition: opacity 0.28s ease, transform 0.28s ease;
          pointer-events: none;
        }
        .fp-image-viewer.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        .fp-image-viewer-inner {
          background: #fff;
          border-radius: 14px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10);
          overflow: hidden;
          width: 180px;
        }
        .fp-image-viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px 6px;
          background: var(--brand);
        }
        .fp-image-viewer-label {
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.3px;
        }
        .fp-image-viewer-close {
          background: none;
          border: none;
          color: #fff;
          font-size: 13px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          opacity: 0.85;
          transition: opacity 0.15s;
        }
        .fp-image-viewer-close:hover { opacity: 1; }
        .fp-image-viewer-body {
          padding: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .fp-image-viewer-img {
          width: 140px;
          height: 140px;
          object-fit: contain;
          border-radius: 8px;
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          display: block;
        }
        .fp-image-viewer-meta {
          width: 100%;
          text-align: center;
        }
        .fp-image-viewer-finger {
          font-size: 11px;
          color: var(--muted);
          font-weight: 500;
        }
      </style>
    `;
  }
}

customElements.define('fingerprint-component', FingerprintComponent);