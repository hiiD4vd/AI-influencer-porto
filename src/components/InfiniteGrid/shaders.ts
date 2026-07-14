// Vertex shader for grid tiles
export const tileVertex = /* glsl */`
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Foreground tile shader.
 * On hover, the dark card background lerps toward uHoverColor (the
 * per-image dominant color), exactly replicating the phantom.land effect.
 * map.a = 1 means a painted pixel (image/text), 0 means empty card background.
 */
export const tileFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D tUI;
  uniform sampler2D tMedia;
  uniform vec3 uHoverColor;
  uniform float uHoverProgress;

  varying vec2 vUv;

  void main() {
    // UI layer (Text and borders on transparent bg)
    vec4 ui = texture2D(tUI, vUv);
    
    // Media layer (Video or Image)
    vec4 media = texture2D(tMedia, vUv);

    // Phantom.land / Premium style: 
    // Video is slightly dimmed when idle, pops to full brightness on hover
    vec3 mediaDark = mix(media.rgb, vec3(0.02), 0.4); // darkened by 40%
    
    // As it hovers, we also tint it slightly with the dominant color for mood
    vec3 hoverTint = mix(media.rgb, uHoverColor, 0.3);
    
    vec3 mediaColor = mix(mediaDark, hoverTint, uHoverProgress);

    // UI overlays on top of the media.
    // ui.a is 1.0 for text/borders, 0.0 for the transparent center.
    vec3 finalColor = mix(mediaColor, ui.rgb, ui.a);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Legacy — kept for compatibility, no longer used
export const backgroundFrag = /* glsl */`
  precision highp float;
  uniform sampler2D map;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 color = texture2D(map, vUv);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
  }
`

// Post-processing vertex (full-screen triangle)
export const postVertex = /* glsl */`
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

// Post-processing fragment: barrel distortion + vignette
export const postFrag = /* glsl */`
  precision highp float;
  uniform sampler2D tMap;
  uniform float uDistortion;
  uniform float uVignetteOffset;
  uniform float uVignetteDarkness;
  uniform vec2 uResolution;
  varying vec2 vUv;

  vec2 barrelDistort(vec2 uv, float k) {
    vec2 p = uv * 2.0 - 1.0;
    float r2 = dot(p, p);
    p *= 1.0 + k * r2 + k * k * r2 * r2 * 0.3;
    return (p + 1.0) * 0.5;
  }

  void main() {
    vec2 uv = barrelDistort(vUv, uDistortion);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.04, 0.04, 0.04, 1.0);
      return;
    }
    vec4 color = texture2D(tMap, uv);

    // Smooth vignette
    vec2 pos = vUv - 0.5;
    float d = dot(pos, pos) * 4.0;
    float vig = smoothstep(0.8, uVignetteOffset + 0.1, d);
    color.rgb *= 1.0 - (1.0 - vig) * uVignetteDarkness;

    gl_FragColor = color;
  }
`
