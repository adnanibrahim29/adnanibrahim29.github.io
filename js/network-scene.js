// Contact background: a slowly rotating network of glowing nodes, like a distributed cluster.
// Purely decorative. If WebGL or the three.js CDN is unavailable, the section keeps its CSS background.
import { mountScene, createGlowTexture, reducedMotion } from './three-stage.js';

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
const WIDTH_SPREAD = 0.9;                 // on wide sections, stretch the network sideways to this share of the width

mountScene(document.querySelector('.contact'), ({ THREE, scene, camera }) => {
    // The outer group stretches the network to the section's shape; the inner one rotates
    const spread = new THREE.Group();
    scene.add(spread);

    const network = new THREE.Group();
    spread.add(network);

    const pointsMaterial = new THREE.PointsMaterial({
        size: NODE_SIZE,
        map: createGlowTexture(THREE),
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

    if (!reducedMotion) {
        window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    buildNetwork(targetNodeCount());

    return {
        update(delta) {
            network.rotation.y += ROTATION_SPEED * delta;
            network.rotation.x += ROTATION_SPEED * 0.3 * delta;

            const ease = 1 - Math.exp(-PARALLAX_EASING * delta);
            camera.position.x += (parallaxTarget.x * PARALLAX_STRENGTH - camera.position.x) * ease;
            camera.position.y += (parallaxTarget.y * PARALLAX_STRENGTH - camera.position.y) * ease;
            camera.lookAt(scene.position);
        },
        resize() {
            if (targetNodeCount() !== nodeCount) buildNetwork(targetNodeCount());

            const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
            const visibleWidth = 2 * camera.position.z * Math.tan(halfFov) * camera.aspect;
            spread.scale.x = Math.max(1, WIDTH_SPREAD * visibleWidth / (2 * FIELD_RADIUS));
        },
        dispose() {
            window.removeEventListener('pointermove', onPointerMove);
        }
    };
}, { className: 'contact-canvas' });
