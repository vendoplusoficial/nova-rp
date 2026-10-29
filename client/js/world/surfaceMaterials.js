// Texturas pequeñas y repetibles, generadas una vez. Un material para el terreno y otro para
// las vías: no se crea un Mesh por hoja, piedra ni grieta. La proyección mundial evita costuras.
import * as THREE from 'three';

export function makeSurfaceMaterials(renderer) {
  const size = 128, data = new Uint8Array(size * size * 4);
  let state = 89173;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, grain = random();
    // R = hierba de hojas cortas, G = piedra estratificada, B = arena, A = árido del asfalto.
    const blade = Math.sin(x * 1.9 + Math.sin(y * 0.6)) * Math.sin(y * 0.7 + x * 0.3);
    data[i] = Math.round(135 + 44 * blade + 34 * (grain - 0.5));
    data[i + 1] = Math.round(140 + 34 * Math.sin(y * 0.35 + Math.sin(x * 0.12) * 4) + 42 * (grain - 0.5));
    data[i + 2] = Math.round(160 + 18 * Math.sin(x * 0.31 + y * 0.1) + 45 * (random() - 0.5));
    data[i + 3] = Math.round(170 + (grain < 0.05 ? -75 : 35 * (grain - 0.5)));
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  const material = (road) => {
    const mat = new THREE.MeshLambertMaterial({ vertexColors:true });
    mat.customProgramCacheKey = () => `nova-surface-2-${road}`;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSurface = { value:texture };
      shader.vertexShader = 'varying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceWorld = (modelMatrix * vec4(position, 1.0)).xyz;\nvSurfaceNormal = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = 'uniform sampler2D uSurface;\nvarying vec3 vSurfaceWorld;\nvarying vec3 vSurfaceNormal;\n' + shader.fragmentShader;
      const code = road ? `
        vec4 surfaceTex = texture2D(uSurface, vSurfaceWorld.xz * 0.42);
        float surfaceGrain = surfaceTex.a;
        diffuseColor.rgb *= 0.77 + surfaceGrain * 0.36;
      ` : `
        vec3 triWeight = pow(abs(normalize(vSurfaceNormal)), vec3(4.0));
        triWeight /= max(dot(triWeight, vec3(1.0)), 0.0001);
        vec4 surfaceTex = texture2D(uSurface, vSurfaceWorld.yz * 0.22) * triWeight.x
                        + texture2D(uSurface, vSurfaceWorld.xz * 0.22) * triWeight.y
                        + texture2D(uSurface, vSurfaceWorld.xy * 0.22) * triWeight.z;
        float grassWeight = smoothstep(0.005, 0.035, diffuseColor.g - diffuseColor.r);
        float rockWeight = smoothstep(0.2, 0.65, 1.0 - abs(vSurfaceNormal.y));
        float surfaceGrain = mix(surfaceTex.b, surfaceTex.r, grassWeight);
        surfaceGrain = mix(surfaceGrain, surfaceTex.g, rockWeight);
        float broad = texture2D(uSurface, vSurfaceWorld.xz * 0.0067).r;
        diffuseColor.rgb *= (0.62 + surfaceGrain * 0.64) * (0.91 + broad * 0.18);
      `;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + code);
    };
    return mat;
  };
  return { terrain:material(false), road:material(true), texture };
}
