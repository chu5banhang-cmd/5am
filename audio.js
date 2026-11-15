// audio.js - Hệ thống âm thanh Web Audio API đầy đủ cho 5AM (Nhạc nền, Xe chạy, Thời tiết, Môi trường & SFX)
(function () {
    class GameAudioEngine {
        constructor() {
            this.ctx = null;
            this.compressor = null;
            this.masterGain = null;
            this.bgmGain = null;
            this.ambienceGain = null;
            this.sfxGain = null;
            this.volume = 0.7;
            this.unlocked = false;

            // BGM state
            this.currentTheme = 'none';
            this.bgmTimer = null;
            this.bgmStep = 0;
            this.nextNoteTime = 0;

            // Continuous ambience / vehicle nodes
            this.noiseBuffer = null;
            this.rainSource = null;
            this.rainFilter = null;
            this.rainGain = null;

            this.trafficOsc1 = null;
            this.trafficOsc2 = null;
            this.trafficFilter = null;
            this.trafficGain = null;
            this.trafficPan = null;

            this.playerVehOsc1 = null;
            this.playerVehOsc2 = null;
            this.playerVehFilter = null;
            this.playerVehGain = null;

            this.lastFootstepFrame = -1;
            this.lastBikeClickTime = 0;
            this.lastCartRattleTime = 0;
            this.nextHornTime = 0;
            this.nextBellTime = 0;
            this.nextThunderTime = 0;
            this.nextNatureTime = 0;
        }

        init() {
            if (this.ctx) {
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                }
                return true;
            }
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;

            this.ctx = new AudioCtx();
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -16;
            this.compressor.knee.value = 18;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.005;
            this.compressor.release.value = 0.15;

            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;

            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = 0.24;

            this.ambienceGain = this.ctx.createGain();
            this.ambienceGain.gain.value = 0.42;

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.55;

            this.bgmGain.connect(this.compressor);
            this.ambienceGain.connect(this.compressor);
            this.sfxGain.connect(this.compressor);
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            this._createNoiseBuffer();
            this._setupContinuousLoops();
            this._startBGMScheduler();
            this.unlocked = true;
            return true;
        }

        unlock() {
            if (!this.ctx) this.init();
            else if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        setVolume(val) {
            this.volume = Math.max(0, Math.min(1, Number(val) || 0));
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
            }
        }

        _createNoiseBuffer() {
            const sampleRate = this.ctx.sampleRate;
            const length = sampleRate * 2;
            const buffer = this.ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < length; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99765 * b0 + white * 0.099046;
                b1 = 0.96300 * b1 + white * 0.2965164;
                b2 = 0.57000 * b2 + white * 1.0526913;
                data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
            }
            this.noiseBuffer = buffer;
        }

        _setupContinuousLoops() {
            const now = this.ctx.currentTime;

            // 1. Rain / Storm loop
            this.rainSource = this.ctx.createBufferSource();
            this.rainSource.buffer = this.noiseBuffer;
            this.rainSource.loop = true;
            this.rainFilter = this.ctx.createBiquadFilter();
            this.rainFilter.type = 'lowpass';
            this.rainFilter.frequency.value = 1400;
            this.rainGain = this.ctx.createGain();
            this.rainGain.gain.value = 0;
            this.rainSource.connect(this.rainFilter);
            this.rainFilter.connect(this.rainGain);
            this.rainGain.connect(this.ambienceGain);
            this.rainSource.start(now);

            // 2. Street passing motorbike traffic loop
            this.trafficOsc1 = this.ctx.createOscillator();
            this.trafficOsc1.type = 'sawtooth';
            this.trafficOsc1.frequency.value = 68;
            this.trafficOsc2 = this.ctx.createOscillator();
            this.trafficOsc2.type = 'triangle';
            this.trafficOsc2.frequency.value = 136;
            this.trafficFilter = this.ctx.createBiquadFilter();
            this.trafficFilter.type = 'lowpass';
            this.trafficFilter.frequency.value = 320;
            this.trafficGain = this.ctx.createGain();
            this.trafficGain.gain.value = 0;
            this.trafficPan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

            this.trafficOsc1.connect(this.trafficFilter);
            this.trafficOsc2.connect(this.trafficFilter);
            this.trafficFilter.connect(this.trafficGain);
            if (this.trafficPan) {
                this.trafficGain.connect(this.trafficPan);
                this.trafficPan.connect(this.ambienceGain);
            } else {
                this.trafficGain.connect(this.ambienceGain);
            }
            this.trafficOsc1.start(now);
            this.trafficOsc2.start(now);

            // 3. Player vehicle engine loop
            this.playerVehOsc1 = this.ctx.createOscillator();
            this.playerVehOsc1.type = 'sawtooth';
            this.playerVehOsc1.frequency.value = 72;
            this.playerVehOsc2 = this.ctx.createOscillator();
            this.playerVehOsc2.type = 'triangle';
            this.playerVehOsc2.frequency.value = 144;
            this.playerVehFilter = this.ctx.createBiquadFilter();
            this.playerVehFilter.type = 'lowpass';
            this.playerVehFilter.frequency.value = 280;
            this.playerVehGain = this.ctx.createGain();
            this.playerVehGain.gain.value = 0;

            this.playerVehOsc1.connect(this.playerVehFilter);
            this.playerVehOsc2.connect(this.playerVehFilter);
            this.playerVehFilter.connect(this.playerVehGain);
            this.playerVehGain.connect(this.ambienceGain);
            this.playerVehOsc1.start(now);
            this.playerVehOsc2.start(now);
        }

        // =====================================================================
        // NHẠC NỀN (PROCEDURAL LO-FI / PIXEL SAIGON BGM)
        // =====================================================================
        _startBGMScheduler() {
            if (this.bgmTimer) clearInterval(this.bgmTimer);
            this.nextNoteTime = this.ctx.currentTime + 0.05;
            this.bgmTimer = setInterval(() => this._scheduleBGM(), 90);
        }

        _midiToFreq(midi) {
            return 440 * Math.pow(2, (midi - 69) / 12);
        }

        _playBGMNote(freq, time, dur, type = 'triangle', gainPeak = 0.14, cutoff = 1800) {
            if (!freq || !this.ctx) return;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(cutoff, time);

            g.gain.setValueAtTime(0.0001, time);
            g.gain.exponentialRampToValueAtTime(gainPeak, time + 0.018);
            g.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            osc.connect(filter);
            filter.connect(g);
            g.connect(this.bgmGain);
            osc.start(time);
            osc.stop(time + dur + 0.02);
        }

        _playBGMPerc(time, kind = 'hat') {
            if (!this.noiseBuffer || !this.ctx) return;
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();

            if (kind === 'kick') {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(115, time);
                osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
                g.gain.setValueAtTime(0.22, time);
                g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
                osc.connect(g);
                g.connect(this.bgmGain);
                osc.start(time);
                osc.stop(time + 0.13);
                return;
            }

            filter.type = 'highpass';
            filter.frequency.value = kind === 'snare' ? 1400 : 4200;
            const peak = kind === 'snare' ? 0.07 : 0.032;
            const dur = kind === 'snare' ? 0.09 : 0.04;
            g.gain.setValueAtTime(peak, time);
            g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
            src.connect(filter);
            filter.connect(g);
            g.connect(this.bgmGain);
            src.start(time);
            src.stop(time + dur + 0.01);
        }

        _getThemeData(theme) {
            // 16-step patterns
            if (theme === 'menu') {
                return {
                    stepDur: 0.24,
                    chords: [
                        [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]
                    ],
                    melody: [76, 0, 72, 74, 76, 0, 79, 0, 74, 0, 72, 69, 72, 0, 67, 0],
                    bass: [41, 0, 41, 0, 40, 0, 40, 0, 38, 0, 38, 0, 36, 0, 36, 0],
                    drums: false
                };
            }
            if (theme === 'home') {
                return {
                    stepDur: 0.27,
                    chords: [
                        [48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]
                    ],
                    melody: [67, 0, 72, 0, 71, 0, 69, 67, 65, 0, 69, 0, 67, 0, 64, 0],
                    bass: [36, 0, 0, 36, 33, 0, 0, 33, 29, 0, 0, 29, 31, 0, 0, 31],
                    drums: false
                };
            }
            if (theme === 'street_day') {
                return {
                    stepDur: 0.19,
                    chords: [
                        [48, 52, 55, 57], [43, 47, 50, 55], [45, 48, 52, 55], [41, 45, 48, 53]
                    ],
                    melody: [72, 74, 76, 0, 79, 0, 76, 74, 72, 0, 69, 72, 74, 0, 72, 0],
                    bass: [36, 0, 43, 0, 31, 0, 38, 0, 33, 0, 40, 0, 29, 0, 36, 0],
                    drums: true
                };
            }
            if (theme === 'street_night') {
                return {
                    stepDur: 0.25,
                    chords: [
                        [50, 53, 57, 60], [43, 47, 53, 57], [48, 52, 55, 59], [45, 49, 55, 58]
                    ],
                    melody: [69, 0, 72, 74, 0, 71, 69, 0, 67, 0, 71, 72, 0, 67, 64, 0],
                    bass: [38, 0, 0, 38, 31, 0, 0, 31, 36, 0, 0, 36, 33, 0, 0, 33],
                    drums: true
                };
            }
            if (theme === 'festival') {
                return {
                    stepDur: 0.16,
                    chords: [
                        [53, 57, 60, 65], [55, 59, 62, 67], [57, 60, 64, 69], [55, 59, 62, 67]
                    ],
                    melody: [77, 79, 81, 79, 77, 74, 72, 74, 77, 79, 81, 84, 81, 79, 77, 0],
                    bass: [41, 0, 41, 45, 43, 0, 43, 47, 45, 0, 45, 48, 43, 0, 43, 38],
                    drums: true
                };
            }
            return null;
        }

        _scheduleBGM() {
            if (!this.ctx || this.ctx.state !== 'running') return;
            if (this.currentTheme === 'none' || this.volume <= 0.001) {
                this.nextNoteTime = this.ctx.currentTime + 0.05;
                return;
            }
            const data = this._getThemeData(this.currentTheme);
            if (!data) return;

            while (this.nextNoteTime < this.ctx.currentTime + 0.18) {
                const step = this.bgmStep % 16;
                const chordIdx = Math.floor(step / 4);
                const t = this.nextNoteTime;

                if (step % 4 === 0) {
                    const chord = data.chords[chordIdx];
                    chord.forEach((m, idx) => {
                        this._playBGMNote(this._midiToFreq(m), t + idx * 0.015, data.stepDur * 3.6, 'sine', 0.045, 1100);
                    });
                }

                const bassMidi = data.bass[step];
                if (bassMidi) {
                    this._playBGMNote(this._midiToFreq(bassMidi), t, data.stepDur * 1.4, 'triangle', 0.11, 650);
                }

                const melMidi = data.melody[step];
                if (melMidi) {
                    const melType = this.currentTheme === 'street_day' || this.currentTheme === 'festival' ? 'triangle' : 'sine';
                    this._playBGMNote(this._midiToFreq(melMidi), t, data.stepDur * 1.6, melType, 0.085, 2200);
                }

                if (data.drums) {
                    if (step % 4 === 0) this._playBGMPerc(t, 'kick');
                    if (step % 4 === 2) this._playBGMPerc(t, 'snare');
                    if (step % 2 === 1) this._playBGMPerc(t, 'hat');
                }

                this.nextNoteTime += data.stepDur;
                this.bgmStep = (this.bgmStep + 1) % 64;
            }
        }

        setTheme(theme) {
            if (this.currentTheme === theme) return;
            this.currentTheme = theme;
            this.bgmStep = 0;
        }

        // =====================================================================
        // CẬP NHẬT LIÊN TỤC: XE CHẠY, THỜI TIẾT, BƯỚC CHÂN, MÔI TRƯỜNG
        // =====================================================================
        updateFrame(state) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const now = this.ctx.currentTime;

            // 1. Chọn nhạc nền theo trạng thái
            if (state.gameState === 'INTRO') {
                this.setTheme('none');
            } else if (state.gameState === 'WELCOME' || state.gameState === 'MENU' || state.gameState === 'CHARACTER_CREATION') {
                this.setTheme('menu');
            } else if (state.gameState === 'PLAYING_HOME') {
                this.setTheme('home');
            } else if (state.gameState === 'PLAYING_STREET') {
                if (state.isFestival && !state.isIndoors) this.setTheme('festival');
                else if (state.hour >= 17.5 || state.hour < 5.5) this.setTheme('street_night');
                else this.setTheme('street_day');
            }

            const isPlaying = state.gameState === 'PLAYING_HOME' || state.gameState === 'PLAYING_STREET';

            // 2. Thời tiết (Mưa / Bão)
            if (isPlaying && (state.weather === 'RAIN' || state.weather === 'STORM')) {
                const isStorm = state.weather === 'STORM';
                const targetGain = state.isIndoors ? (isStorm ? 0.09 : 0.045) : (isStorm ? 0.24 : 0.13);
                const targetFreq = state.isIndoors ? 420 : (isStorm ? 2100 : 1350);
                this.rainGain.gain.setTargetAtTime(targetGain, now, 0.25);
                this.rainFilter.frequency.setTargetAtTime(targetFreq, now, 0.25);

                if (isStorm && now > this.nextThunderTime) {
                    this.nextThunderTime = now + 9 + Math.random() * 14;
                    this._playThunder(state.isIndoors ? 0.15 : 0.35);
                }
            } else {
                this.rainGain.gain.setTargetAtTime(0, now, 0.25);
            }

            // 3. Tiếng xe máy chạy ngoài đường (Street traffic)
            const hearTraffic = state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.zone !== 'PARK' && state.nearestBike;
            if (hearTraffic) {
                const dist = state.nearestBike.dist;
                const maxDist = 620;
                const closeness = Math.max(0, 1 - dist / maxDist);
                const vol = Math.pow(closeness, 1.8) * 0.065;
                const pan = Math.max(-0.85, Math.min(0.85, state.nearestBike.dx / 500));
                const speedFreq = 58 + Math.abs(state.nearestBike.speed) * 16;

                this.trafficOsc1.frequency.setTargetAtTime(speedFreq, now, 0.08);
                this.trafficOsc2.frequency.setTargetAtTime(speedFreq * 2.02, now, 0.08);
                this.trafficFilter.frequency.setTargetAtTime(180 + closeness * 260, now, 0.08);
                this.trafficGain.gain.setTargetAtTime(vol, now, 0.08);
                if (this.trafficPan) this.trafficPan.pan.setTargetAtTime(pan, now, 0.08);

                // Thỉnh thoảng có tiếng còi xe máy Sài Gòn khi chạy gần
                if (closeness > 0.45 && now > this.nextHornTime) {
                    this.nextHornTime = now + 6 + Math.random() * 11;
                    this.playHorn(pan, 0.11 * closeness);
                }
            } else {
                this.trafficGain.gain.setTargetAtTime(0, now, 0.12);
            }

            // 4. Tiếng chuông xe đạp ở Khu Đón Gió
            if (state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.zone === 'BREEZE_AREA' && state.nearestCyclistDist < 360) {
                if (now > this.nextBellTime) {
                    this.nextBellTime = now + 5 + Math.random() * 8;
                    this.playBikeBell(0.14);
                }
            }

            // 5. Tiếng xe của người chơi (Xe máy, Xe hơi, Siêu xe, Xe đạp, Xe đẩy cà phê)
            if (state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.activeVehicle && state.activeVehicle !== 'bike') {
                const moving = state.isMoving;
                let baseFreq = 64;
                let filterFreq = 260;
                let gainVal = moving ? 0.06 : 0.018;

                if (state.activeVehicle === 'scooter') {
                    baseFreq = moving ? 92 : 58;
                    filterFreq = moving ? 460 : 210;
                } else if (state.activeVehicle === 'car') {
                    baseFreq = moving ? 68 : 44;
                    filterFreq = moving ? 340 : 170;
                } else if (state.activeVehicle === 'supercar') {
                    baseFreq = moving ? 112 : 62;
                    filterFreq = moving ? 640 : 240;
                    gainVal = moving ? 0.075 : 0.024;
                }

                this.playerVehOsc1.frequency.setTargetAtTime(baseFreq, now, 0.07);
                this.playerVehOsc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.07);
                this.playerVehFilter.frequency.setTargetAtTime(filterFreq, now, 0.07);
                this.playerVehGain.gain.setTargetAtTime(gainVal, now, 0.07);
            } else {
                this.playerVehGain.gain.setTargetAtTime(0, now, 0.08);
            }

            // Tiếng xích xe đạp khi đạp xe
            if (state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.isMoving && (state.activeVehicle === 'bike' || state.ridingBicycle)) {
                if (now - this.lastBikeClickTime > 0.22) {
                    this.lastBikeClickTime = now;
                    this._playTinyTick(1600, 0.025, 0.03);
                }
            }

            // Tiếng bánh xe đẩy cà phê lạch cạch khi đẩy
            if (state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.isMoving && state.isPushingCart) {
                if (now - this.lastCartRattleTime > 0.28) {
                    this.lastCartRattleTime = now;
                    this._playTinyTick(240, 0.045, 0.04);
                }
            }

            // 6. Tiếng bước chân đi bộ
            if (isPlaying && state.isMoving && !state.activeVehicle && !state.ridingBicycle) {
                if ((state.animFrame === 1 || state.animFrame === 3) && state.animFrame !== this.lastFootstepFrame) {
                    this.lastFootstepFrame = state.animFrame;
                    this._playFootstep(state.isIndoors);
                } else if (state.animFrame === 0 || state.animFrame === 2) {
                    this.lastFootstepFrame = -1;
                }
            }

            // 7. Tiếng chim hót buổi sáng / dế kêu buổi tối (khi trời không mưa bão)
            if (state.gameState === 'PLAYING_STREET' && !state.isIndoors && state.weather !== 'RAIN' && state.weather !== 'STORM') {
                if (now > this.nextNatureTime) {
                    this.nextNatureTime = now + 4.5 + Math.random() * 6.5;
                    if (state.hour >= 5 && state.hour < 9.5) {
                        this._playBirdChirp();
                    } else if (state.hour >= 19 || state.hour < 5) {
                        this._playCricket();
                    }
                }
            }
        }

        // =====================================================================
        // CÁC HIỆU ỨNG ÂM THANH (SFX)
        // =====================================================================
        _tone(freq, dur, type = 'triangle', vol = 0.2, delay = 0, slideTo = null) {
            if (!this.ctx || this.volume <= 0.001) return;
            const t = this.ctx.currentTime + delay;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t);
            if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            osc.connect(g);
            g.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + dur + 0.02);
        }

        _noiseBurst(dur, filterFreq, filterType = 'bandpass', vol = 0.12, delay = 0) {
            if (!this.ctx || !this.noiseBuffer || this.volume <= 0.001) return;
            const t = this.ctx.currentTime + delay;
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = filterType;
            filter.frequency.setValueAtTime(filterFreq, t);
            const g = this.ctx.createGain();
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            src.connect(filter);
            filter.connect(g);
            g.connect(this.sfxGain);
            src.start(t);
            src.stop(t + dur + 0.02);
        }

        _playTinyTick(freq, vol, dur) {
            this._tone(freq, dur, 'square', vol, 0, freq * 0.7);
        }

        _playFootstep(isIndoors) {
            const pitch = (isIndoors ? 165 : 120) + Math.random() * 25;
            this._tone(pitch, 0.055, 'sine', 0.06, 0, pitch * 0.6);
            this._noiseBurst(0.035, isIndoors ? 700 : 1100, 'bandpass', 0.035);
        }

        _playThunder(vol = 0.3) {
            this._noiseBurst(1.8, 130, 'lowpass', vol);
            this._tone(52, 1.4, 'sine', vol * 0.6, 0, 32);
        }

        _playBirdChirp() {
            const base = 2100 + Math.random() * 500;
            this._tone(base, 0.07, 'sine', 0.045, 0, base * 1.25);
            this._tone(base * 1.15, 0.08, 'sine', 0.04, 0.1, base * 0.95);
        }

        _playCricket() {
            for (let i = 0; i < 3; i++) {
                this._tone(3800, 0.035, 'sine', 0.022, i * 0.06);
            }
        }

        playClick() {
            this._tone(620, 0.045, 'triangle', 0.14, 0, 420);
        }

        playModalOpen() {
            this._tone(420, 0.07, 'triangle', 0.12, 0, 640);
        }

        playModalClose() {
            this._tone(540, 0.07, 'triangle', 0.1, 0, 340);
        }

        playDoor() {
            this._tone(190, 0.09, 'triangle', 0.18, 0, 110);
            this._tone(320, 0.06, 'sine', 0.1, 0.06, 260);
        }

        playZoneSwitch() {
            this._noiseBurst(0.14, 850, 'bandpass', 0.08);
            this._tone(380, 0.11, 'sine', 0.1, 0, 560);
        }

        playBrew() {
            // Tiếng pha cà phê: hơi nước + rót nước + đá lách tách
            this._noiseBurst(0.28, 1900, 'bandpass', 0.12, 0);
            this._tone(1450, 0.06, 'sine', 0.12, 0.12, 1800);
            this._tone(1950, 0.05, 'sine', 0.1, 0.2, 2200);
        }

        playCoin() {
            // Tiếng thu tiền leng keng
            this._tone(987.77, 0.08, 'triangle', 0.22, 0);
            this._tone(1318.51, 0.22, 'triangle', 0.24, 0.07);
        }

        playBuy() {
            this._noiseBurst(0.1, 1600, 'bandpass', 0.09, 0);
            this._tone(660, 0.07, 'triangle', 0.16, 0.03);
            this._tone(880, 0.11, 'triangle', 0.16, 0.09);
        }

        playEat() {
            this._noiseBurst(0.06, 1200, 'bandpass', 0.12, 0);
            this._noiseBurst(0.06, 1400, 'bandpass', 0.1, 0.08);
            this._tone(523.25, 0.08, 'sine', 0.16, 0.15);
            this._tone(659.25, 0.12, 'sine', 0.16, 0.22);
        }

        playCustomerBell() {
            // Chuông cửa quán cà phê
            this._tone(1174.66, 0.18, 'sine', 0.16, 0);
            this._tone(987.77, 0.28, 'sine', 0.14, 0.14);
        }

        playDialogue(isStart = false) {
            const base = isStart ? 480 : 540 + Math.random() * 80;
            this._tone(base, 0.045, 'triangle', 0.11, 0, base * 1.1);
        }

        playError() {
            this._tone(210, 0.09, 'sawtooth', 0.12, 0, 170);
            this._tone(170, 0.12, 'sawtooth', 0.12, 0.1, 140);
        }

        playUnlock() {
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((n, i) => this._tone(n, 0.14, 'triangle', 0.18, i * 0.07));
        }

        playSleep() {
            const notes = [659.25, 587.33, 523.25, 392.0];
            notes.forEach((n, i) => this._tone(n, 0.24, 'sine', 0.16, i * 0.14));
        }

        playWakeUp() {
            const notes = [523.25, 659.25, 783.99, 987.77];
            notes.forEach((n, i) => this._tone(n, 0.16, 'triangle', 0.18, i * 0.09));
        }

        playCartToggle() {
            this._tone(180, 0.08, 'square', 0.1, 0, 120);
            this._tone(310, 0.08, 'triangle', 0.14, 0.05, 390);
        }

        playBikeBell(vol = 0.2) {
            this._tone(1980, 0.16, 'sine', vol, 0);
            this._tone(2640, 0.18, 'sine', vol * 0.7, 0.02);
            this._tone(1980, 0.18, 'sine', vol * 0.8, 0.14);
        }

        playHorn(pan = 0, vol = 0.15) {
            if (!this.ctx || this.volume <= 0.001) return;
            const t = this.ctx.currentTime;
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const g = this.ctx.createGain();
            const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.setValueAtTime(490, t);
            osc2.frequency.setValueAtTime(615, t);
            filter.type = 'lowpass';
            filter.frequency.value = 1600;

            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(g);
            if (panner) {
                panner.pan.value = pan;
                g.connect(panner);
                panner.connect(this.sfxGain);
            } else {
                g.connect(this.sfxGain);
            }
            osc1.start(t);
            osc2.start(t);
            osc1.stop(t + 0.11);
            osc2.stop(t + 0.11);
        }

        playFestivalHit(good) {
            if (good) {
                this._tone(784, 0.09, 'triangle', 0.2, 0);
                this._tone(1046.5, 0.18, 'triangle', 0.22, 0.07);
            } else {
                this._tone(330, 0.12, 'triangle', 0.15, 0, 260);
            }
        }
    }

    window.GameAudio = new GameAudioEngine();
})();
