// Shared setup for the decorative three.js backgrounds (hero network, contact globe).
// Handles the renderer, resizing, pausing offscreen or in hidden tabs, reduced motion and cleanup,
// so each scene only has to describe what it draws.

const MAX_PIXEL_RATIO = 2;

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

// Mounts a canvas at the start of `container` and calls `setup({ THREE, scene, camera })` once
// three.js has loaded. `setup` may return any of these hooks:
//   update(delta)          every frame, with the seconds since the last frame
//   resize(width, height)  when the container changes size (camera.aspect is already set)
//   dispose()              remove the scene's own event listeners
// Geometries, materials and textures in the scene are disposed automatically.
// If WebGL or the CDN is unavailable, nothing is mounted and the CSS background stays.
export function mountScene(container, setup, { className = '', fov = 60, cameraZ = 10 } = {}) {
    if (!container || !webglAvailable()) return;
    start().catch(() => {});

    async function start() {
        const THREE = await import('three');

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
        const canvas = renderer.domElement;
        canvas.className = `scene-canvas ${className}`.trim();
        canvas.setAttribute('aria-hidden', 'true');

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
        camera.position.z = cameraZ;

        const hooks = setup({ THREE, scene, camera }) || {};

        function render() {
            renderer.render(scene, camera);
        }

        let lastTime = null;

        function tick(time) {
            const delta = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;
            hooks.update?.(delta);
            render();
        }

        // Only animate while the container is on screen and the tab is visible
        let onScreen = true;
        let running = false;

        function updateLoop() {
            const shouldRun = !reducedMotion && onScreen && !document.hidden;
            if (shouldRun === running) return;
            running = shouldRun;
            lastTime = null;
            renderer.setAnimationLoop(running ? tick : null);
        }

        function resize() {
            const { clientWidth: width, clientHeight: height } = container;
            if (!width || !height) return;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            hooks.resize?.(width, height);
            camera.updateProjectionMatrix();
            if (!running) render();
        }

        const resizeObserver = new ResizeObserver(resize);
        const intersectionObserver = new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            updateLoop();
        });

        function onPageHide(event) {
            if (!event.persisted) dispose();
        }

        function onContextLost(event) {
            event.preventDefault();
            dispose();
        }

        function dispose() {
            renderer.setAnimationLoop(null);
            running = false;
            resizeObserver.disconnect();
            intersectionObserver.disconnect();
            document.removeEventListener('visibilitychange', updateLoop);
            window.removeEventListener('pagehide', onPageHide);
            canvas.removeEventListener('webglcontextlost', onContextLost);
            hooks.dispose?.();
            scene.traverse(object => {
                object.geometry?.dispose();
                object.material?.map?.dispose();
                object.material?.dispose();
            });
            renderer.dispose();
            canvas.remove();
        }

        container.prepend(canvas);
        resize();

        resizeObserver.observe(container);
        intersectionObserver.observe(container);
        document.addEventListener('visibilitychange', updateLoop);
        window.addEventListener('pagehide', onPageHide);
        canvas.addEventListener('webglcontextlost', onContextLost);

        // With reduced motion, the single frame drawn by resize() is all that is shown
        updateLoop();
        requestAnimationFrame(() => canvas.classList.add('is-ready'));
    }
}

// Soft round sprite so each point looks like a small glowing dot
export function createGlowTexture(THREE) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
