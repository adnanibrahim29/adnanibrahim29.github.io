// Hero background: a slowly rotating network of glowing nodes, like a distributed cluster.
// Purely decorative. If WebGL or the three.js CDN is unavailable, the hero keeps its CSS background.

// Settings
const NODE_COUNT_DESKTOP = 80;
const NODE_COUNT_MOBILE = 40;
const MOBILE_BREAKPOINT = 768;            // px, matches the stylesheet's phone/tablet breakpoint
const NODE_COLOURS = ['#ffd700', '#f5deb3', '#00ffff']; // gold, wheat, aqua (site palette)
const LINE_COLOUR = '#f5deb3';            // wheat
const LINE_OPACITY = 0.35;                // brightness of the closest links (0 to 1)
const NODE_SIZE = 0.35;                   // world units
const CONNECTION_DISTANCE = 2.4;          // only nodes closer than this are linked
const FIELD_RADIUS = 5;                   // nodes are scattered inside a sphere of this radius
const ROTATION_SPEED = 0.05;              // radians per second
const PARALLAX_STRENGTH = 0.8;            // how far the camera drifts toward the mouse
const PARALLAX_EASING = 2;                // higher = camera follows the mouse faster
const MAX_PIXEL_RATIO = 2;

const hero = document.querySelector('.home');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch {
        return false;
    }
}

if (hero && webglAvailable()) {
    // A failed CDN load or renderer error just leaves the CSS background in place
    init().catch(() => {});
}

async function init() {
    const THREE = await import('three');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.domElement.className = 'hero-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 10;

    const network = new THREE.Group();
    scene.add(network);

    const glowTexture = createGlowTexture(THREE);
    const pointsMaterial = new THREE.PointsMaterial({
        size: NODE_SIZE,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        depthWrite: false
    });
    // Line colours carry an alpha channel so far-apart links fade out
    const linesMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false
    });

    let points = null;
    let lines = null;
    let nodeCount = 0;

    function buildNetwork(count) {
        disposeNetwork();
        nodeCount = count;

        const positions = [];
        const colours = [];
        const colour = new THREE.Color();
        const node = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            node.randomDirection().multiplyScalar(FIELD_RADIUS * Math.cbrt(Math.random()));
            positions.push(node.x, node.y, node.z);
            colour.set(NODE_COLOURS[i % NODE_COLOURS.length]);
            colours.push(colour.r, colour.g, colour.b);
        }

        // Link nearby nodes; links fade out as they approach CONNECTION_DISTANCE
        const linePositions = [];
        const lineColours = [];
        const lineColour = new THREE.Color(LINE_COLOUR);
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            a.fromArray(positions, i * 3);
            for (let j = i + 1; j < count; j++) {
                b.fromArray(positions, j * 3);
                const distance = a.distanceTo(b);
                if (distance < CONNECTION_DISTANCE) {
                    const fade = (1 - distance / CONNECTION_DISTANCE) * LINE_OPACITY;
                    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
                    for (let k = 0; k < 2; k++) {
                        lineColours.push(lineColour.r, lineColour.g, lineColour.b, fade);
                    }
                }
            }
        }

        const pointsGeometry = new THREE.BufferGeometry();
        pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        points = new THREE.Points(pointsGeometry, pointsMaterial);

        const linesGeometry = new THREE.BufferGeometry();
        linesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        linesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColours, 4));
        lines = new THREE.LineSegments(linesGeometry, linesMaterial);

        network.add(points, lines);
    }

    function disposeNetwork() {
        for (const object of [points, lines]) {
            if (object) {
                network.remove(object);
                object.geometry.dispose();
            }
        }
        points = lines = null;
    }

    function targetNodeCount() {
        return window.innerWidth <= MOBILE_BREAKPOINT ? NODE_COUNT_MOBILE : NODE_COUNT_DESKTOP;
    }

    // Mouse parallax: the camera eases toward a target set by the pointer position
    const parallaxTarget = new THREE.Vector2();

    function onPointerMove(event) {
        parallaxTarget.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -((event.clientY / window.innerHeight) * 2 - 1)
        );
    }

    function render() {
        renderer.render(scene, camera);
    }

    let lastTime = null;

    function tick(time) {
        const delta = lastTime === null ? 0 : Math.min((time - lastTime) / 1000, 0.1);
        lastTime = time;

        network.rotation.y += ROTATION_SPEED * delta;
        network.rotation.x += ROTATION_SPEED * 0.3 * delta;

        const ease = 1 - Math.exp(-PARALLAX_EASING * delta);
        camera.position.x += (parallaxTarget.x * PARALLAX_STRENGTH - camera.position.x) * ease;
        camera.position.y += (parallaxTarget.y * PARALLAX_STRENGTH - camera.position.y) * ease;
        camera.lookAt(scene.position);

        render();
    }

    // Only animate while the hero is on screen and the tab is visible
    let heroVisible = true;
    let running = false;

    function updateLoop() {
        const shouldRun = !reducedMotion && heroVisible && !document.hidden;
        if (shouldRun === running) return;
        running = shouldRun;
        lastTime = null;
        renderer.setAnimationLoop(running ? tick : null);
    }

    function resize() {
        const { clientWidth: width, clientHeight: height } = hero;
        if (!width || !height) return;
        if (targetNodeCount() !== nodeCount) buildNetwork(targetNodeCount());
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        if (!running) render();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
        heroVisible = entry.isIntersecting;
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
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pagehide', onPageHide);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        disposeNetwork();
        pointsMaterial.dispose();
        linesMaterial.dispose();
        glowTexture.dispose();
        renderer.dispose();
        renderer.domElement.remove();
    }

    hero.prepend(renderer.domElement);
    buildNetwork(targetNodeCount());
    resize();

    resizeObserver.observe(hero);
    intersectionObserver.observe(hero);
    document.addEventListener('visibilitychange', updateLoop);
    window.addEventListener('pagehide', onPageHide);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    if (!reducedMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    // With reduced motion, the single frame drawn by resize() is all that is shown
    updateLoop();
    requestAnimationFrame(() => renderer.domElement.classList.add('is-ready'));
}

// Soft round sprite so each node looks like a small glowing dot
function createGlowTexture(THREE) {
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
