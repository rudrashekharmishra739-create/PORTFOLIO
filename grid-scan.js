/* GridScan — vanilla JS port of the React Bits "GridScan" hero background.
   Same GLSL engine and usage settings (mouse-reactive perspective grid,
   ping-pong scan beam, film grain). Framework-free: no three.js, no
   postprocessing lib, no face-api.js — call window.initGridScan(el, options).
   Deliberate differences from the React original:
   - No webcam/gyro: a portfolio must never prompt visitors for the camera.
     (enableWebcam/showPreview/enableGyro options are accepted but ignored.)
   - Bloom + chromatic aberration are reimplemented as small raw-WebGL
     passes (bright-pass, separable blur, composite) instead of the
     postprocessing package. Same look, zero dependencies.
   - Theme defaults below are monochrome to match this portfolio
     (lines #3a3a38, scan beam #f7f7f5). Pass linesColor/scanColor to change.
   - The rAF loop pauses while the hero is off-screen and renders a single
     static frame under prefers-reduced-motion. */
(function () {
  'use strict';

  var VERT =
    'attribute vec2 p;\n' +
    'varying vec2 vUv;\n' +
    'void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';

  var FRAG = [
    '#extension GL_OES_standard_derivatives : enable',
    'precision highp float;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform vec2 uSkew;',
    'uniform float uTilt;',
    'uniform float uYaw;',
    'uniform float uLineThickness;',
    'uniform vec3 uLinesColor;',
    'uniform vec3 uScanColor;',
    'uniform float uGridScale;',
    'uniform float uLineStyle;',
    'uniform float uLineJitter;',
    'uniform float uScanOpacity;',
    'uniform float uScanDirection;',
    'uniform float uNoise;',
    'uniform float uBloomOpacity;',
    'uniform float uScanGlow;',
    'uniform float uScanSoftness;',
    'uniform float uPhaseTaper;',
    'uniform float uScanDuration;',
    'uniform float uScanDelay;',
    'uniform float uLightMode;',
    'varying vec2 vUv;',
    '',
    'uniform float uScanStarts[8];',
    'uniform float uScanCount;',
    '',
    'const int MAX_SCANS = 8;',
    '',
    'float smoother01(float a, float b, float x){',
    '  float t = clamp((x - a) / max(1e-5, (b - a)), 0.0, 1.0);',
    '  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);',
    '}',
    '',
    'void mainImage(out vec4 fragColor, in vec2 fragCoord)',
    '{',
    '    vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;',
    '',
    '    vec3 ro = vec3(0.0);',
    '    vec3 rd = normalize(vec3(p, 2.0));',
    '',
    '    float cR = cos(uTilt), sR = sin(uTilt);',
    '    rd.xy = mat2(cR, -sR, sR, cR) * rd.xy;',
    '',
    '    float cY = cos(uYaw), sY = sin(uYaw);',
    '    rd.xz = mat2(cY, -sY, sY, cY) * rd.xz;',
    '',
    '    vec2 skew = clamp(uSkew, vec2(-0.7), vec2(0.7));',
    '    rd.xy += skew * rd.z;',
    '',
    '    vec3 color = vec3(0.0);',
    '  float minT = 1e20;',
    '  float gridScale = max(1e-5, uGridScale);',
    '    float fadeStrength = 2.0;',
    '    vec2 gridUV = vec2(0.0);',
    '',
    '  float hitIsY = 1.0;',
    '    for (int i = 0; i < 4; i++)',
    '    {',
    '        float isY = float(i < 2);',
    '        float pos = mix(-0.2, 0.2, float(i)) * isY + mix(-0.5, 0.5, float(i - 2)) * (1.0 - isY);',
    '        float num = pos - (isY * ro.y + (1.0 - isY) * ro.x);',
    '        float den = isY * rd.y + (1.0 - isY) * rd.x;',
    '        float t = num / den;',
    '        vec3 h = ro + rd * t;',
    '',
    '        float depthBoost = smoothstep(0.0, 3.0, h.z);',
    '        h.xy += skew * 0.15 * depthBoost;',
    '',
    '    bool use = t > 0.0 && t < minT;',
    '    gridUV = use ? mix(h.zy, h.xz, isY) / gridScale : gridUV;',
    '    minT = use ? t : minT;',
    '    hitIsY = use ? isY : hitIsY;',
    '    }',
    '',
    '    vec3 hit = ro + rd * minT;',
    '    float dist = length(hit - ro);',
    '',
    '  float jitterAmt = clamp(uLineJitter, 0.0, 1.0);',
    '  if (jitterAmt > 0.0) {',
    '    vec2 j = vec2(',
    '      sin(gridUV.y * 2.7 + iTime * 1.8),',
    '      cos(gridUV.x * 2.3 - iTime * 1.6)',
    '    ) * (0.15 * jitterAmt);',
    '    gridUV += j;',
    '  }',
    '  float fx = fract(gridUV.x);',
    '  float fy = fract(gridUV.y);',
    '  float ax = min(fx, 1.0 - fx);',
    '  float ay = min(fy, 1.0 - fy);',
    '  float wx = fwidth(gridUV.x);',
    '  float wy = fwidth(gridUV.y);',
    '  float halfPx = max(0.0, uLineThickness) * 0.5;',
    '',
    '  float tx = halfPx * wx;',
    '  float ty = halfPx * wy;',
    '',
    '  float aax = wx;',
    '  float aay = wy;',
    '',
    '  float lineX = 1.0 - smoothstep(tx, tx + aax, ax);',
    '  float lineY = 1.0 - smoothstep(ty, ty + aay, ay);',
    '  if (uLineStyle > 0.5) {',
    '    float dashRepeat = 4.0;',
    '    float dashDuty = 0.5;',
    '    float vy = fract(gridUV.y * dashRepeat);',
    '    float vx = fract(gridUV.x * dashRepeat);',
    '    float dashMaskY = step(vy, dashDuty);',
    '    float dashMaskX = step(vx, dashDuty);',
    '    if (uLineStyle < 1.5) {',
    '      lineX *= dashMaskY;',
    '      lineY *= dashMaskX;',
    '    } else {',
    '      float dotRepeat = 6.0;',
    '      float dotWidth = 0.18;',
    '      float cy = abs(fract(gridUV.y * dotRepeat) - 0.5);',
    '      float cx = abs(fract(gridUV.x * dotRepeat) - 0.5);',
    '      float dotMaskY = 1.0 - smoothstep(dotWidth, dotWidth + fwidth(gridUV.y * dotRepeat), cy);',
    '      float dotMaskX = 1.0 - smoothstep(dotWidth, dotWidth + fwidth(gridUV.x * dotRepeat), cx);',
    '      lineX *= dotMaskY;',
    '      lineY *= dotMaskX;',
    '    }',
    '  }',
    '  float primaryMask = max(lineX, lineY);',
    '',
    '  vec2 gridUV2 = (hitIsY > 0.5 ? hit.xz : hit.zy) / gridScale;',
    '  if (jitterAmt > 0.0) {',
    '    vec2 j2 = vec2(',
    '      cos(gridUV2.y * 2.1 - iTime * 1.4),',
    '      sin(gridUV2.x * 2.5 + iTime * 1.7)',
    '    ) * (0.15 * jitterAmt);',
    '    gridUV2 += j2;',
    '  }',
    '  float fx2 = fract(gridUV2.x);',
    '  float fy2 = fract(gridUV2.y);',
    '  float ax2 = min(fx2, 1.0 - fx2);',
    '  float ay2 = min(fy2, 1.0 - fy2);',
    '  float wx2 = fwidth(gridUV2.x);',
    '  float wy2 = fwidth(gridUV2.y);',
    '  float tx2 = halfPx * wx2;',
    '  float ty2 = halfPx * wy2;',
    '  float aax2 = wx2;',
    '  float aay2 = wy2;',
    '  float lineX2 = 1.0 - smoothstep(tx2, tx2 + aax2, ax2);',
    '  float lineY2 = 1.0 - smoothstep(ty2, ty2 + aay2, ay2);',
    '  if (uLineStyle > 0.5) {',
    '    float dashRepeat2 = 4.0;',
    '    float dashDuty2 = 0.5;',
    '    float vy2m = fract(gridUV2.y * dashRepeat2);',
    '    float vx2m = fract(gridUV2.x * dashRepeat2);',
    '    float dashMaskY2 = step(vy2m, dashDuty2);',
    '    float dashMaskX2 = step(vx2m, dashDuty2);',
    '    if (uLineStyle < 1.5) {',
    '      lineX2 *= dashMaskY2;',
    '      lineY2 *= dashMaskX2;',
    '    } else {',
    '      float dotRepeat2 = 6.0;',
    '      float dotWidth2 = 0.18;',
    '      float cy2 = abs(fract(gridUV2.y * dotRepeat2) - 0.5);',
    '      float cx2 = abs(fract(gridUV2.x * dotRepeat2) - 0.5);',
    '      float dotMaskY2 = 1.0 - smoothstep(dotWidth2, dotWidth2 + fwidth(gridUV2.y * dotRepeat2), cy2);',
    '      float dotMaskX2 = 1.0 - smoothstep(dotWidth2, dotWidth2 + fwidth(gridUV2.x * dotRepeat2), cx2);',
    '      lineX2 *= dotMaskY2;',
    '      lineY2 *= dotMaskX2;',
    '    }',
    '  }',
    '    float altMask = max(lineX2, lineY2);',
    '',
    '    float edgeDistX = min(abs(hit.x - (-0.5)), abs(hit.x - 0.5));',
    '    float edgeDistY = min(abs(hit.y - (-0.2)), abs(hit.y - 0.2));',
    '    float edgeDist = mix(edgeDistY, edgeDistX, hitIsY);',
    '    float edgeGate = 1.0 - smoothstep(gridScale * 0.5, gridScale * 2.0, edgeDist);',
    '    altMask *= edgeGate;',
    '',
    '  float lineMask = max(primaryMask, altMask);',
    '',
    '    float fade = exp(-dist * fadeStrength);',
    '',
    '    float dur = max(0.05, uScanDuration);',
    '    float del = max(0.0, uScanDelay);',
    '    float scanZMax = 2.0;',
    '    float widthScale = max(0.1, uScanGlow);',
    '    float sigma = max(0.001, 0.18 * widthScale * uScanSoftness);',
    '    float sigmaA = sigma * 2.0;',
    '',
    '    float combinedPulse = 0.0;',
    '    float combinedAura = 0.0;',
    '',
    '    float cycle = dur + del;',
    '    float tCycle = mod(iTime, cycle);',
    '    float scanPhase = clamp((tCycle - del) / dur, 0.0, 1.0);',
    '    float phase = scanPhase;',
    '    if (uScanDirection > 0.5 && uScanDirection < 1.5) {',
    '      phase = 1.0 - phase;',
    '    } else if (uScanDirection > 1.5) {',
    '      float t2 = mod(max(0.0, iTime - del), 2.0 * dur);',
    '      phase = (t2 < dur) ? (t2 / dur) : (1.0 - (t2 - dur) / dur);',
    '    }',
    '    float scanZ = phase * scanZMax;',
    '    float dz = abs(hit.z - scanZ);',
    '    float lineBand = exp(-0.5 * (dz * dz) / (sigma * sigma));',
    '    float taper = clamp(uPhaseTaper, 0.0, 0.49);',
    '    float headW = taper;',
    '    float tailW = taper;',
    '    float headFade = smoother01(0.0, headW, phase);',
    '    float tailFade = 1.0 - smoother01(1.0 - tailW, 1.0, phase);',
    '    float phaseWindow = headFade * tailFade;',
    '    float pulseBase = lineBand * phaseWindow;',
    '    combinedPulse += pulseBase * clamp(uScanOpacity, 0.0, 1.0);',
    '    float auraBand = exp(-0.5 * (dz * dz) / (sigmaA * sigmaA));',
    '    combinedAura += (auraBand * 0.25) * phaseWindow * clamp(uScanOpacity, 0.0, 1.0);',
    '',
    '    for (int i = 0; i < MAX_SCANS; i++) {',
    '      if (float(i) >= uScanCount) break;',
    '      float tActiveI = iTime - uScanStarts[i];',
    '      float phaseI = clamp(tActiveI / dur, 0.0, 1.0);',
    '      if (uScanDirection > 0.5 && uScanDirection < 1.5) {',
    '        phaseI = 1.0 - phaseI;',
    '      } else if (uScanDirection > 1.5) {',
    '        phaseI = (phaseI < 0.5) ? (phaseI * 2.0) : (1.0 - (phaseI - 0.5) * 2.0);',
    '      }',
    '      float scanZI = phaseI * scanZMax;',
    '      float dzI = abs(hit.z - scanZI);',
    '      float lineBandI = exp(-0.5 * (dzI * dzI) / (sigma * sigma));',
    '      float headFadeI = smoother01(0.0, headW, phaseI);',
    '      float tailFadeI = 1.0 - smoother01(1.0 - tailW, 1.0, phaseI);',
    '      float phaseWindowI = headFadeI * tailFadeI;',
    '      combinedPulse += lineBandI * phaseWindowI * clamp(uScanOpacity, 0.0, 1.0);',
    '      float auraBandI = exp(-0.5 * (dzI * dzI) / (sigmaA * sigmaA));',
    '      combinedAura += (auraBandI * 0.25) * phaseWindowI * clamp(uScanOpacity, 0.0, 1.0);',
    '    }',
    '',
    '  float lineVis = lineMask;',
    '  vec3 gridCol = uLinesColor * lineVis * fade;',
    '  vec3 scanCol = uScanColor * combinedPulse;',
    '  vec3 scanAura = uScanColor * combinedAura;',
    '',
    '    color = gridCol + scanCol + scanAura;',
    '',
    '  float n = fract(sin(dot(gl_FragCoord.xy + vec2(iTime * 123.4), vec2(12.9898,78.233))) * 43758.5453123);',
    '  color += (n - 0.5) * uNoise;',
    '  color = clamp(color, 0.0, 1.0);',
    '  float alpha = clamp(max(lineVis, combinedPulse), 0.0, 1.0);',
    '  float gx = 1.0 - smoothstep(tx * 2.0, tx * 2.0 + aax * 2.0, ax);',
    '  float gy = 1.0 - smoothstep(ty * 2.0, ty * 2.0 + aay * 2.0, ay);',
    '  float halo = max(gx, gy) * fade;',
    '  alpha = max(alpha, halo * clamp(uBloomOpacity, 0.0, 1.0));',
    '  if (uLightMode > 0.5) {',
    '    float energy = max(max(color.r, color.g), color.b);',
    '    float coverage = clamp(max(alpha, smoothstep(0.0, 0.55, energy) * 0.82), 0.0, 0.9);',
    '    coverage *= smoothstep(0.015, 0.12, energy);',
    '    vec3 chroma = clamp(color / max(energy, 0.0001), 0.0, 1.0);',
    '    chroma = pow(chroma, vec3(1.2));',
    '    fragColor = vec4(mix(vec3(1.0), chroma, coverage * 0.94), 1.0);',
    '  } else {',
    '    fragColor = vec4(color, alpha);',
    '  }',
    '}',
    '',
    'void main(){',
    '  vec4 c;',
    '  mainImage(c, vUv * iResolution.xy);',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  var BLUR_FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uTexel;',
    'uniform vec2 uDir;',
    'uniform float uThreshold;',
    'void main(){',
    '  vec3 acc = vec3(0.0);',
    '  vec2 o1 = uDir * uTexel * 1.3846153846;',
    '  vec2 o2 = uDir * uTexel * 3.2307692308;',
    '  vec3 c0 = texture2D(uTex, vUv).rgb;',
    '  vec3 c1 = texture2D(uTex, vUv + o1).rgb;',
    '  vec3 c2 = texture2D(uTex, vUv - o1).rgb;',
    '  vec3 c3 = texture2D(uTex, vUv + o2).rgb;',
    '  vec3 c4 = texture2D(uTex, vUv - o2).rgb;',
    '  acc += c0 * 0.2270270270;',
    '  acc += (c1 + c2) * 0.3162162162;',
    '  acc += (c3 + c4) * 0.0702702703;',
    '  float lum = dot(acc, vec3(0.2126, 0.7152, 0.0722));',
    '  float m = clamp((lum - uThreshold) / 0.05, 0.0, 1.0);',
    '  gl_FragColor = vec4(acc * m, 1.0);',
    '}'
  ].join('\n');

  var COMP_FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uBloom;',
    'uniform float uBloomOpacity;',
    'uniform float uChroma;',
    'void main(){',
    '  vec2 dir = vUv - 0.5;',
    '  float r = texture2D(uScene, vUv + dir * uChroma).r;',
    '  float g = texture2D(uScene, vUv).g;',
    '  float b = texture2D(uScene, vUv - dir * uChroma).b;',
    '  vec3 scene = vec3(r, g, b);',
    '  float a = texture2D(uScene, vUv).a;',
    '  vec3 bloom = texture2D(uBloom, vUv).rgb;',
    '  gl_FragColor = vec4(scene + bloom * uBloomOpacity, a);',
    '}'
  ].join('\n');

  var clamp01 = function (v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  };
  var lerp = function (a, b, t) {
    return a + (b - a) * t;
  };
  var hexToLinear = function (hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
    var n = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(n)) n = 0xffffff;
    var f = function (v) {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
  };
  var smoothDampFloat = function (current, target, vel, smoothTime, dt) {
    smoothTime = Math.max(0.0001, smoothTime);
    var omega = 2 / smoothTime;
    var x = omega * dt;
    var exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    var originalTo = target;
    var change = current - target;
    target = current - change;
    var temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * exp;
    var out = target + (change + temp) * exp;
    var origMinusCurrent = originalTo - current;
    var outMinusOrig = out - originalTo;
    if (origMinusCurrent * outMinusOrig > 0) {
      out = originalTo;
      vel.v = 0;
    }
    return out;
  };

  window.initGridScan = function (container, options) {
    var o = {
      sensitivity: 0.55,
      lineThickness: 1,
      linesColor: '#3a3a38',
      gridScale: 0.1,
      lineStyle: 'solid',
      lineJitter: 0.1,
      scanColor: '#f7f7f5',
      scanOpacity: 0.4,
      scanDirection: 'pingpong',
      scanGlow: 0.5,
      scanSoftness: 2,
      scanPhaseTaper: 0.9,
      scanDuration: 2.0,
      scanDelay: 2.0,
      enablePost: true,
      bloomIntensity: 0.6,
      bloomThreshold: 0,
      bloomSmoothing: 0,
      chromaticAberration: 0.002,
      noiseIntensity: 0.01,
      scanOnClick: false,
      snapBackDelay: 250
    };
    if (options) for (var k in options) o[k] = options[k];
    if (!container) return function () {};

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    var gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false }) ||
             canvas.getContext('experimental-webgl', { alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) { container.removeChild(canvas); return function () {}; }
    var ext = gl.getExtension('OES_standard_derivatives');
    if (!ext) { container.removeChild(canvas); return function () {}; }

    var compile = function (type, src) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        try { console.warn('[gridscan] shader error: ' + gl.getShaderInfoLog(sh)); } catch (e) {}
        return null;
      }
      return sh;
    };
    var program = function (fsSrc) {
      var vs = compile(gl.VERTEX_SHADER, VERT);
      var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      var p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      return p;
    };

    var sceneProg = program(FRAG);
    var blurProg = program(BLUR_FRAG);
    var compProg = program(COMP_FRAG);
    if (!sceneProg || !blurProg || !compProg) { container.removeChild(canvas); return function () {}; }

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var bindQuad = function (prog) {
      var loc = gl.getAttribLocation(prog, 'p');
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    };

    var makeTarget = function (w, h) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: tex, fb: fb, w: w, h: h };
    };

    var s = clamp01(o.sensitivity, 0, 1);
    var skewScale = lerp(0.06, 0.2, s);
    var yBoost = lerp(1.2, 1.6, s);
    var smoothTime = lerp(0.45, 0.12, s);
    var styleCode = o.lineStyle === 'dashed' ? 1 : o.lineStyle === 'dotted' ? 2 : 0;
    var dirCode = o.scanDirection === 'backward' ? 1 : o.scanDirection === 'pingpong' ? 2 : 0;
    var linesLin = hexToLinear(o.linesColor);
    var scanLin = hexToLinear(o.scanColor);

    var U = {};
    ['iResolution', 'iTime', 'uSkew', 'uTilt', 'uYaw', 'uLineThickness', 'uLinesColor',
     'uScanColor', 'uGridScale', 'uLineStyle', 'uLineJitter', 'uScanOpacity', 'uScanDirection',
     'uNoise', 'uBloomOpacity', 'uScanGlow', 'uScanSoftness', 'uPhaseTaper', 'uScanDuration',
     'uScanDelay', 'uScanStarts', 'uScanCount', 'uLightMode'
    ].forEach(function (n) { U[n] = gl.getUniformLocation(sceneProg, n); });

    var BU = {
      uTex: gl.getUniformLocation(blurProg, 'uTex'),
      uTexel: gl.getUniformLocation(blurProg, 'uTexel'),
      uDir: gl.getUniformLocation(blurProg, 'uDir'),
      uThreshold: gl.getUniformLocation(blurProg, 'uThreshold')
    };
    var CU = {
      uScene: gl.getUniformLocation(compProg, 'uScene'),
      uBloom: gl.getUniformLocation(compProg, 'uBloom'),
      uBloomOpacity: gl.getUniformLocation(compProg, 'uBloomOpacity'),
      uChroma: gl.getUniformLocation(compProg, 'uChroma')
    };

    var W = 1, H = 1, dpr = 1;
    var sceneT = null, bloomA = null, bloomB = null;
    var resize = function () {
      W = Math.max(1, container.clientWidth);
      H = Math.max(1, container.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      var bw = Math.max(1, Math.round(W * dpr / 2));
      var bh = Math.max(1, Math.round(H * dpr / 2));
      [sceneT, bloomA, bloomB].forEach(function (t) {
        if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      });
      sceneT = makeTarget(canvas.width, canvas.height);
      bloomA = makeTarget(bw, bh);
      bloomB = makeTarget(bw, bh);
    };

    var lookTarget = { x: 0, y: 0 };
    var lookCur = { x: 0, y: 0 };
    var lookVel = { x: 0, y: 0 };
    var leaveTimer = null;
    var hero = container.parentElement;

    var onMove = function (e) {
      var host = hero && hero.clientWidth ? hero : container;
      var rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      lookTarget.x = nx;
      lookTarget.y = ny;
      if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    };
    var onLeave = function () {
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(function () {
        lookTarget.x = 0;
        lookTarget.y = 0;
      }, Math.max(0, o.snapBackDelay || 0));
    };
    var listenEl = hero || container;
    listenEl.addEventListener('pointermove', onMove, { passive: true });
    listenEl.addEventListener('pointerleave', onLeave, { passive: true });

    var alive = true;
    var visible = true;
    var raf = 0;
    var startT = performance.now();

    var render = function (tSec) {
      // scene pass
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
      gl.viewport(0, 0, sceneT.w, sceneT.h);
      gl.useProgram(sceneProg);
      bindQuad(sceneProg);
      gl.uniform3f(U.iResolution, sceneT.w, sceneT.h, dpr);
      gl.uniform1f(U.iTime, tSec);
      gl.uniform2f(U.uSkew, lookCur.x * skewScale, -lookCur.y * yBoost * skewScale);
      gl.uniform1f(U.uTilt, 0);
      gl.uniform1f(U.uYaw, 0);
      gl.uniform1f(U.uLineThickness, o.lineThickness);
      gl.uniform3f(U.uLinesColor, linesLin[0], linesLin[1], linesLin[2]);
      gl.uniform3f(U.uScanColor, scanLin[0], scanLin[1], scanLin[2]);
      gl.uniform1f(U.uGridScale, o.gridScale);
      gl.uniform1f(U.uLineStyle, styleCode);
      gl.uniform1f(U.uLineJitter, Math.max(0, Math.min(1, o.lineJitter || 0)));
      gl.uniform1f(U.uScanOpacity, o.scanOpacity);
      gl.uniform1f(U.uScanDirection, dirCode);
      gl.uniform1f(U.uNoise, o.noiseIntensity);
      gl.uniform1f(U.uBloomOpacity, Math.max(0, o.bloomIntensity));
      gl.uniform1f(U.uScanGlow, o.scanGlow);
      gl.uniform1f(U.uScanSoftness, o.scanSoftness);
      gl.uniform1f(U.uPhaseTaper, o.scanPhaseTaper);
      gl.uniform1f(U.uScanDuration, Math.max(0.05, o.scanDuration));
      gl.uniform1f(U.uScanDelay, Math.max(0, o.scanDelay));
      gl.uniform1fv(U.uScanStarts, [0, 0, 0, 0, 0, 0, 0, 0]);
      gl.uniform1f(U.uScanCount, 0);
      gl.uniform1f(U.uLightMode, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (o.enablePost && o.bloomIntensity > 0) {
        // blur H (with bright-pass threshold)
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
        gl.viewport(0, 0, bloomA.w, bloomA.h);
        gl.useProgram(blurProg);
        bindQuad(blurProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
        gl.uniform1i(BU.uTex, 0);
        gl.uniform2f(BU.uTexel, 1 / bloomA.w, 1 / bloomA.h);
        gl.uniform2f(BU.uDir, 1, 0);
        gl.uniform1f(BU.uThreshold, o.bloomThreshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // blur V
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fb);
        gl.viewport(0, 0, bloomB.w, bloomB.h);
        gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
        gl.uniform1i(BU.uTex, 0);
        gl.uniform2f(BU.uTexel, 1 / bloomB.w, 1 / bloomB.h);
        gl.uniform2f(BU.uDir, 0, 1);
        gl.uniform1f(BU.uThreshold, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // composite to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(compProg);
        bindQuad(compProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
        gl.uniform1i(CU.uScene, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
        gl.uniform1i(CU.uBloom, 1);
        gl.uniform1f(CU.uBloomOpacity, Math.max(0, o.bloomIntensity));
        gl.uniform1f(CU.uChroma, o.chromaticAberration || 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        // blit scene straight to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(compProg);
        bindQuad(compProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
        gl.uniform1i(CU.uScene, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
        gl.uniform1i(CU.uBloom, 1);
        gl.uniform1f(CU.uBloomOpacity, 0);
        gl.uniform1f(CU.uChroma, o.chromaticAberration || 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    };

    var last = performance.now();
    var tick = function (now) {
      raf = 0;
      if (!alive || !visible) return;
      var dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      var vx = { v: lookVel.x };
      var vy = { v: lookVel.y };
      lookCur.x = smoothDampFloat(lookCur.x, lookTarget.x, vx, smoothTime, dt);
      lookVel.x = vx.v;
      lookCur.y = smoothDampFloat(lookCur.y, lookTarget.y, vy, smoothTime, dt);
      lookVel.y = vy.v;
      render((now - startT) / 1000);
      raf = requestAnimationFrame(tick);
    };
    var kick = function () {
      if (!raf && alive && visible && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    var ro = null;
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(container);
    }
    window.addEventListener('resize', resize);
    var io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) kick();
      });
      io.observe(container);
    }
    resize();
    if (reduced) {
      render(0.6);
    } else {
      kick();
    }

    return function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      window.removeEventListener('resize', resize);
      listenEl.removeEventListener('pointermove', onMove);
      listenEl.removeEventListener('pointerleave', onLeave);
      if (leaveTimer) clearTimeout(leaveTimer);
      try {
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (e) {}
      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  };
})();
